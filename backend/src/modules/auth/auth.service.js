import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { getDb } from '../../db/connection.js';
import { unauthorized, badRequest, AppError } from '../../core/errors.js';
import { audit, randomToken, sha256 } from '../../core/utils.js';
import { usersRepository } from '../users/users.repository.js';
import { rolesRepository } from '../users/roles.repository.js';
import { hashPassword, verifyPassword, DUMMY_HASH } from './password.js';

const refreshTtlMs = () => env.REFRESH_TOKEN_TTL_DAYS * 86_400_000;

function issueAccessToken(user) {
  return jwt.sign({ role: user.role_code }, env.JWT_SECRET, {
    subject: String(user.id),
    audience: 'staff',
    expiresIn: env.ACCESS_TOKEN_TTL,
    algorithm: 'HS256',
  });
}

function issueRefreshToken(userId) {
  const token = randomToken(48);
  getDb()
    .prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(userId, sha256(token), new Date(Date.now() + refreshTtlMs()).toISOString());
  return token;
}

export function profileOf(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: { id: user.role_id, code: user.role_code, name: user.role_name },
    sectorId: user.sector_id,
    mustChangePassword: !!user.must_change_password,
    permissions: [...rolesRepository.permissionsOf(user.role_id)],
  };
}

function session(user) {
  return { accessToken: issueAccessToken(user), refreshToken: issueRefreshToken(user.id), user: profileOf(user) };
}

export const authService = {
  async login(username, password) {
    const user = usersRepository.findByUsername(username);
    const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !user.active) throw unauthorized('Usuario o contraseña incorrectos');
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new AppError(423, 'Cuenta bloqueada temporalmente por intentos fallidos. Intentá más tarde.', 'LOCKED');
    }
    if (!ok) {
      usersRepository.registerFailedLogin(user.id, env.LOGIN_MAX_ATTEMPTS, env.LOGIN_LOCK_MINUTES);
      audit(user.id, 'login_fallido', 'user', user.id);
      throw unauthorized('Usuario o contraseña incorrectos');
    }
    usersRepository.registerSuccessfulLogin(user.id);
    audit(user.id, 'login', 'user', user.id);
    return session(user);
  },

  /** Rotación de refresh token: el usado se revoca y se emite uno nuevo. */
  refresh(token) {
    if (!token) throw unauthorized();
    const db = getDb();
    const row = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(sha256(token));
    if (!row) throw unauthorized();
    if (row.revoked_at) {
      // Reutilización detectada: se revocan todas las sesiones del usuario.
      db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(new Date().toISOString(), row.user_id);
      throw unauthorized('Sesión inválida');
    }
    if (new Date(row.expires_at) < new Date()) throw unauthorized('Sesión expirada');
    const user = usersRepository.findById(row.user_id);
    if (!user?.active) throw unauthorized();
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
    return session(user);
  },

  logout(token) {
    if (!token) return;
    getDb().prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(new Date().toISOString(), sha256(token));
  },

  async changePassword(userId, currentPassword, newPassword) {
    const user = usersRepository.findById(userId);
    if (!(await verifyPassword(currentPassword, user.password_hash))) throw badRequest('La contraseña actual no es correcta');
    if (currentPassword === newPassword) throw badRequest('La nueva contraseña debe ser distinta a la actual');
    usersRepository.setPassword(userId, await hashPassword(newPassword), false);
    getDb().prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(new Date().toISOString(), userId);
    audit(userId, 'cambio_password', 'user', userId);
    return session(usersRepository.findById(userId));
  },

  purgeExpired() {
    getDb().prepare("DELETE FROM refresh_tokens WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')").run();
  },
};
