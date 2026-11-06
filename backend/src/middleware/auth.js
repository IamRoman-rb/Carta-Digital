/**
 * Autenticación (JWT de acceso) y autorización basada en roles/permisos (RBAC).
 * Cadena de responsabilidad de Express: authenticate -> requirePermission -> handler.
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized, forbidden } from '../core/errors.js';
import { usersRepository } from '../modules/users/users.repository.js';
import { rolesRepository } from '../modules/users/roles.repository.js';

function extractToken(req) {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  // EventSource (SSE) no permite cabeceras: se acepta token en query solo para /stream.
  if (req.path.endsWith('/stream') && typeof req.query.token === 'string') return req.query.token;
  return null;
}

export function authenticate(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next(unauthorized());
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], audience: 'staff' });
  } catch {
    return next(unauthorized('Sesión expirada o inválida'));
  }
  const user = usersRepository.findById(Number(payload.sub));
  if (!user || !user.active) return next(unauthorized('Usuario inactivo'));
  req.user = {
    id: user.id,
    name: user.name,
    username: user.username,
    roleId: user.role_id,
    roleCode: user.role_code,
    sectorId: user.sector_id,
    mustChangePassword: !!user.must_change_password,
    permissions: rolesRepository.permissionsOf(user.role_id),
  };
  next();
}

/** Exige al menos uno de los permisos indicados. */
export const requirePermission = (...codes) => (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.mustChangePassword) return next(forbidden('Debés cambiar tu contraseña antes de continuar'));
  if (codes.some((c) => req.user.permissions.has(c))) return next();
  next(forbidden());
};
