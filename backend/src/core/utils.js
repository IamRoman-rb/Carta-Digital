import crypto from 'node:crypto';
import { getDb } from '../db/connection.js';

export const nowIso = () => new Date().toISOString();

export const parseJson = (value, fallback) => {
  try {
    return value == null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/** Redondeo bancario a centavo entero. */
export const round = (n) => Math.round(n);

/** Registro de auditoría (trazabilidad de acciones críticas). */
export function audit(userId, action, entity, entityId = null, detail = null) {
  getDb()
    .prepare('INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)')
    .run(userId ?? null, action, entity, entityId, detail ? JSON.stringify(detail) : null);
}
