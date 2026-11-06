import { getDb } from '../../db/connection.js';

/** Repositorio de roles con caché de permisos invalidable. */
const cache = new Map();

export const rolesRepository = {
  list() {
    const db = getDb();
    const roles = db.prepare('SELECT id, code, name, is_system FROM roles ORDER BY id').all();
    const perms = db.prepare('SELECT role_id, permission_code FROM role_permissions').all();
    return roles.map((r) => ({
      ...r,
      is_system: !!r.is_system,
      permissions: perms.filter((p) => p.role_id === r.id).map((p) => p.permission_code),
    }));
  },

  findById(id) {
    return getDb().prepare('SELECT id, code, name, is_system FROM roles WHERE id = ?').get(id);
  },

  findByCode(code) {
    return getDb().prepare('SELECT id, code, name, is_system FROM roles WHERE code = ?').get(code);
  },

  permissionsOf(roleId) {
    if (!cache.has(roleId)) {
      const codes = getDb().prepare('SELECT permission_code FROM role_permissions WHERE role_id = ?').pluck().all(roleId);
      cache.set(roleId, new Set(codes));
    }
    return cache.get(roleId);
  },

  setPermission(roleId, code, enabled) {
    const db = getDb();
    if (enabled) db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_code) VALUES (?, ?)').run(roleId, code);
    else db.prepare('DELETE FROM role_permissions WHERE role_id = ? AND permission_code = ?').run(roleId, code);
    cache.delete(roleId);
  },

  clearCache() {
    cache.clear();
  },
};
