import { getDb } from '../../db/connection.js';

const SELECT = `
  SELECT u.id, u.name, u.username, u.password_hash, u.role_id, r.code AS role_code, r.name AS role_name,
         u.sector_id, s.name AS sector_name, u.active, u.must_change_password, u.failed_attempts,
         u.locked_until, u.last_login_at, u.created_at
  FROM users u
  JOIN roles r ON r.id = u.role_id
  LEFT JOIN sectors s ON s.id = u.sector_id`;

const strip = ({ password_hash: _omit, ...rest }) => ({ ...rest, active: !!rest.active, must_change_password: !!rest.must_change_password });

export const usersRepository = {
  findById(id) {
    return getDb().prepare(`${SELECT} WHERE u.id = ?`).get(id);
  },

  findByUsername(username) {
    return getDb().prepare(`${SELECT} WHERE u.username = ?`).get(username);
  },

  list() {
    return getDb().prepare(`${SELECT} ORDER BY u.active DESC, u.name`).all().map(strip);
  },

  publicView: strip,

  create({ name, username, passwordHash, roleId, sectorId, mustChangePassword = true }) {
    const info = getDb()
      .prepare(
        `INSERT INTO users (name, username, password_hash, role_id, sector_id, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(name, username, passwordHash, roleId, sectorId ?? null, mustChangePassword ? 1 : 0);
    return Number(info.lastInsertRowid);
  },

  update(id, { name, roleId, sectorId, active }) {
    getDb()
      .prepare(
        `UPDATE users SET name = ?, role_id = ?, sector_id = ?, active = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      )
      .run(name, roleId, sectorId ?? null, active ? 1 : 0, id);
  },

  setPassword(id, passwordHash, mustChange) {
    getDb()
      .prepare(
        `UPDATE users SET password_hash = ?, must_change_password = ?, failed_attempts = 0, locked_until = NULL,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      )
      .run(passwordHash, mustChange ? 1 : 0, id);
  },

  registerFailedLogin(id, maxAttempts, lockMinutes) {
    const db = getDb();
    db.prepare('UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id = ?').run(id);
    const { failed_attempts: n } = db.prepare('SELECT failed_attempts FROM users WHERE id = ?').get(id);
    if (n >= maxAttempts) {
      const until = new Date(Date.now() + lockMinutes * 60_000).toISOString();
      db.prepare('UPDATE users SET locked_until = ?, failed_attempts = 0 WHERE id = ?').run(until, id);
    }
  },

  registerSuccessfulLogin(id) {
    getDb()
      .prepare(`UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);
  },

  countActiveAdmins() {
    return getDb()
      .prepare(`SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'admin' AND u.active = 1`)
      .pluck()
      .get();
  },
};
