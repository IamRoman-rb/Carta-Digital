import { getDb } from '../../db/connection.js';

export const floorRepository = {
  sectors() {
    return getDb().prepare('SELECT * FROM sectors ORDER BY sort_order, name').all().map((s) => ({ ...s, active: !!s.active }));
  },
  tables() {
    return getDb().prepare('SELECT * FROM dining_tables WHERE active = 1 ORDER BY sector_id, number').all();
  },
  table(id) {
    return getDb().prepare('SELECT * FROM dining_tables WHERE id = ? AND active = 1').get(id);
  },
  tableByToken(token) {
    return getDb()
      .prepare('SELECT t.*, s.name AS sector_name FROM dining_tables t JOIN sectors s ON s.id = t.sector_id WHERE t.qr_token = ? AND t.active = 1')
      .get(token);
  },
  tableById(id) {
    return getDb()
      .prepare('SELECT t.*, s.name AS sector_name FROM dining_tables t JOIN sectors s ON s.id = t.sector_id WHERE t.id = ? AND t.active = 1')
      .get(id);
  },
  /** Marca mesas como liberadas: invalida los check-in por QR anteriores. */
  markReleased(tableIds) {
    const stmt = getDb().prepare('UPDATE dining_tables SET released_at = ? WHERE id = ?');
    const now = new Date().toISOString();
    for (const id of tableIds) stmt.run(now, id);
  },
  activeTableIdsOfSession(sessionId) {
    return getDb().prepare('SELECT table_id FROM session_tables WHERE session_id = ? AND active = 1').pluck().all(sessionId);
  },
  /** Sesión activa (abierta o pidiendo cuenta) de una mesa. */
  activeSessionOf(tableId) {
    return getDb()
      .prepare(
        `SELECT s.* FROM table_sessions s JOIN session_tables st ON st.session_id = s.id
         WHERE st.table_id = ? AND st.active = 1 AND s.status != 'closed'`,
      )
      .get(tableId);
  },
  session(id) {
    return getDb().prepare('SELECT * FROM table_sessions WHERE id = ?').get(id);
  },
  activeSessions() {
    return getDb()
      .prepare(
        `SELECT s.*, u.name AS waiter_name FROM table_sessions s LEFT JOIN users u ON u.id = s.waiter_id
         WHERE s.status != 'closed' ORDER BY s.opened_at`,
      )
      .all();
  },
  tablesOfSession(sessionId) {
    return getDb()
      .prepare(
        `SELECT t.id, t.number, t.label, t.sector_id, sc.name AS sector_name FROM session_tables st
         JOIN dining_tables t ON t.id = st.table_id JOIN sectors sc ON sc.id = t.sector_id
         WHERE st.session_id = ? AND st.active = 1 ORDER BY t.number`,
      )
      .all(sessionId);
  },
  createSession({ waiterId, guests, openedBy }) {
    return Number(getDb().prepare('INSERT INTO table_sessions (waiter_id, guests, opened_by) VALUES (?, ?, ?)').run(waiterId ?? null, guests, openedBy).lastInsertRowid);
  },
  attachTable(sessionId, tableId) {
    getDb().prepare('INSERT INTO session_tables (session_id, table_id, active) VALUES (?, ?, 1)').run(sessionId, tableId);
  },
  detachTable(sessionId, tableId) {
    getDb().prepare('DELETE FROM session_tables WHERE session_id = ? AND table_id = ?').run(sessionId, tableId);
  },
  pendingCalls() {
    return getDb()
      .prepare(
        `SELECT c.*, t.number AS table_number, sc.name AS sector_name FROM service_calls c
         JOIN dining_tables t ON t.id = c.table_id JOIN sectors sc ON sc.id = t.sector_id
         WHERE c.status = 'pendiente' ORDER BY c.created_at`,
      )
      .all();
  },
};
