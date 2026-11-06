import { getDb, tx } from '../../db/connection.js';
import { badRequest, conflict, notFound } from '../../core/errors.js';
import { eventBus, Events } from '../../core/eventBus.js';
import { audit, randomToken, nowIso } from '../../core/utils.js';
import { calculateBill } from '../billing/billCalculator.js';
import { floorRepository as repo } from './floor.repository.js';

const changed = (extra = {}) => eventBus.publish(Events.TABLES_CHANGED, extra);

function kitchenSummary(sessionId) {
  return getDb()
    .prepare(
      `SELECT SUM(CASE WHEN i.status IN ('pendiente','preparando') THEN i.quantity ELSE 0 END) AS in_kitchen,
              SUM(CASE WHEN i.status = 'listo' THEN i.quantity ELSE 0 END) AS ready,
              SUM(CASE WHEN i.status = 'entregado' THEN i.quantity ELSE 0 END) AS delivered
       FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.session_id = ?`,
    )
    .get(sessionId);
}

function sessionView(s) {
  const bill = calculateBill(s.id);
  return {
    id: s.id,
    status: s.status,
    guests: s.guests,
    waiter_id: s.waiter_id,
    waiter_name: s.waiter_name ?? null,
    opened_at: s.opened_at,
    discount_pct: s.discount_pct,
    tables: repo.tablesOfSession(s.id),
    total: bill.total,
    paid: bill.paid,
    balance: bill.balance,
    items_count: bill.items.reduce((n, i) => n + i.quantity, 0),
    kitchen: kitchenSummary(s.id),
  };
}

export const floorService = {
  state() {
    const sessions = repo.activeSessions().map(sessionView);
    const byTable = new Map();
    for (const s of sessions) for (const t of s.tables) byTable.set(t.id, s.id);
    const calls = repo.pendingCalls();
    return {
      sectors: repo.sectors(),
      tables: repo.tables().map((t) => ({ ...t, session_id: byTable.get(t.id) ?? null })),
      sessions,
      calls,
    };
  },

  sessionDetail(sessionId) {
    const s = getDb()
      .prepare('SELECT s.*, u.name AS waiter_name FROM table_sessions s LEFT JOIN users u ON u.id = s.waiter_id WHERE s.id = ?')
      .get(sessionId);
    if (!s) throw notFound('Cuenta inexistente');
    return { ...sessionView(s), bill: calculateBill(sessionId) };
  },

  openTable(user, tableId, { guests, waiterId }) {
    return tx(() => {
      const table = repo.table(tableId);
      if (!table) throw notFound('Mesa inexistente');
      if (repo.activeSessionOf(tableId)) throw conflict(`La mesa ${table.number} ya está abierta`);
      const waiter = waiterId ?? (user.roleCode === 'mozo' ? user.id : null);
      const sessionId = repo.createSession({ waiterId: waiter, guests, openedBy: user.id });
      repo.attachTable(sessionId, tableId);
      audit(user.id, 'abrir_mesa', 'session', sessionId, { table: table.number });
      changed({ sessionId });
      return sessionId;
    });
  },

  /**
   * Unir mesas (drag & drop): la mesa "source" se suelta sobre "target".
   * Las cuentas se fusionan en la sesión destino (pedidos, pagos y llamados incluidos).
   */
  mergeTables(user, sourceId, targetId) {
    if (sourceId === targetId) throw badRequest('Elegí dos mesas distintas');
    return tx(() => {
      const source = repo.table(sourceId);
      const target = repo.table(targetId);
      if (!source || !target) throw notFound('Mesa inexistente');
      const s = repo.activeSessionOf(sourceId);
      const t = repo.activeSessionOf(targetId);
      if (s && t && s.id === t.id) throw conflict('Las mesas ya están unidas');
      const db = getDb();
      let sessionId;
      if (!s && !t) {
        sessionId = repo.createSession({ waiterId: user.roleCode === 'mozo' ? user.id : null, guests: 1, openedBy: user.id });
        repo.attachTable(sessionId, targetId);
        repo.attachTable(sessionId, sourceId);
      } else if (s && !t) {
        sessionId = s.id;
        repo.attachTable(sessionId, targetId);
      } else if (!s && t) {
        sessionId = t.id;
        repo.attachTable(sessionId, sourceId);
      } else {
        sessionId = t.id;
        db.prepare('UPDATE orders SET session_id = ? WHERE session_id = ?').run(t.id, s.id);
        db.prepare('UPDATE payments SET session_id = ? WHERE session_id = ?').run(t.id, s.id);
        db.prepare('UPDATE service_calls SET session_id = ? WHERE session_id = ?').run(t.id, s.id);
        const moved = db.prepare('SELECT table_id FROM session_tables WHERE session_id = ? AND active = 1').pluck().all(s.id);
        db.prepare('DELETE FROM session_tables WHERE session_id = ?').run(s.id);
        for (const tableId of moved) repo.attachTable(t.id, tableId);
        db.prepare('UPDATE table_sessions SET guests = guests + ?, waiter_id = COALESCE(waiter_id, ?) WHERE id = ?').run(s.guests, s.waiter_id, t.id);
        db.prepare("UPDATE table_sessions SET status = 'closed', closed_at = ?, closed_by = ?, merged_into = ? WHERE id = ?").run(nowIso(), user.id, t.id, s.id);
      }
      audit(user.id, 'unir_mesas', 'session', sessionId, { source: source.number, target: target.number });
      changed({ sessionId });
      return sessionId;
    });
  },

  /** Separa una mesa de una cuenta unida. Los consumos quedan en la cuenta original. */
  separateTable(user, tableId) {
    return tx(() => {
      const s = repo.activeSessionOf(tableId);
      if (!s) throw badRequest('La mesa no tiene una cuenta abierta');
      if (repo.tablesOfSession(s.id).length < 2) throw badRequest('La mesa no está unida a otra');
      repo.detachTable(s.id, tableId);
      repo.markReleased([tableId]);
      audit(user.id, 'separar_mesa', 'session', s.id, { tableId });
      changed({ sessionId: s.id });
    });
  },

  /** Reubica una cuenta completa a otra mesa libre. */
  moveSession(user, fromTableId, toTableId) {
    return tx(() => {
      const s = repo.activeSessionOf(fromTableId);
      if (!s) throw badRequest('La mesa de origen no tiene cuenta abierta');
      if (!repo.table(toTableId)) throw notFound('Mesa destino inexistente');
      if (repo.activeSessionOf(toTableId)) throw conflict('La mesa destino está ocupada. Usá "Unir mesas".');
      repo.detachTable(s.id, fromTableId);
      repo.markReleased([fromTableId]);
      repo.attachTable(s.id, toTableId);
      audit(user.id, 'reubicar_mesa', 'session', s.id, { fromTableId, toTableId });
      changed({ sessionId: s.id });
    });
  },

  updateSession(user, sessionId, { guests, waiterId }) {
    const s = repo.session(sessionId);
    if (!s || s.status === 'closed') throw notFound('Cuenta inexistente o cerrada');
    getDb().prepare('UPDATE table_sessions SET guests = ?, waiter_id = ? WHERE id = ?').run(guests ?? s.guests, waiterId === undefined ? s.waiter_id : waiterId, sessionId);
    audit(user.id, 'editar_cuenta', 'session', sessionId, { guests, waiterId });
    changed({ sessionId });
  },

  /** Libera una mesa abierta por error (sin consumos ni pagos). */
  cancelSession(user, sessionId) {
    return tx(() => {
      const bill = calculateBill(sessionId);
      if (!bill || bill.status === 'closed') throw notFound('Cuenta inexistente o cerrada');
      if (bill.items.length || bill.payments.length) throw conflict('La cuenta tiene consumos: debe cobrarse o anularse desde Caja');
      const db = getDb();
      repo.markReleased(repo.activeTableIdsOfSession(sessionId));
      db.prepare('UPDATE session_tables SET active = 0 WHERE session_id = ?').run(sessionId);
      db.prepare("UPDATE table_sessions SET status = 'closed', closed_at = ?, closed_by = ? WHERE id = ?").run(nowIso(), user.id, sessionId);
      db.prepare("UPDATE service_calls SET status = 'atendida', attended_at = ?, attended_by = ? WHERE session_id = ? AND status = 'pendiente'").run(nowIso(), user.id, sessionId);
      audit(user.id, 'liberar_mesa', 'session', sessionId);
      changed({ sessionId });
    });
  },

  attendCall(user, callId) {
    const info = getDb()
      .prepare("UPDATE service_calls SET status = 'atendida', attended_at = ?, attended_by = ? WHERE id = ? AND status = 'pendiente'")
      .run(nowIso(), user.id, callId);
    if (!info.changes) throw notFound('Llamado inexistente o ya atendido');
    eventBus.publish(Events.CALL_UPDATED, { callId });
    changed();
  },

  // ---------- Edición del plano ----------
  saveSector(user, id, { name, sort_order: sort, active }) {
    const db = getDb();
    if (id) db.prepare('UPDATE sectors SET name = ?, sort_order = ?, active = ? WHERE id = ?').run(name, sort, active ? 1 : 0, id);
    else id = Number(db.prepare('INSERT INTO sectors (name, sort_order, active) VALUES (?, ?, ?)').run(name, sort, active ? 1 : 0).lastInsertRowid);
    audit(user.id, 'guardar_sector', 'sector', id, { name });
    changed();
    return id;
  },

  deleteSector(user, id) {
    const n = getDb().prepare('SELECT COUNT(*) FROM dining_tables WHERE sector_id = ? AND active = 1').pluck().get(id);
    if (n) throw conflict('El sector tiene mesas. Eliminá o mové las mesas primero.');
    getDb().prepare('DELETE FROM dining_tables WHERE sector_id = ? AND active = 0 AND id NOT IN (SELECT table_id FROM session_tables)').run(id);
    const used = getDb().prepare('SELECT COUNT(*) FROM dining_tables WHERE sector_id = ?').pluck().get(id);
    if (used) getDb().prepare('UPDATE sectors SET active = 0 WHERE id = ?').run(id);
    else getDb().prepare('DELETE FROM sectors WHERE id = ?').run(id);
    audit(user.id, 'eliminar_sector', 'sector', id);
    changed();
  },

  createTable(user, data) {
    const db = getDb();
    const exists = db.prepare('SELECT id, active FROM dining_tables WHERE sector_id = ? AND number = ?').get(data.sector_id, data.number);
    if (exists?.active) throw conflict(`Ya existe la mesa ${data.number} en ese sector`);
    let id;
    if (exists) {
      db.prepare('UPDATE dining_tables SET active = 1, seats = ?, shape = ?, pos_x = ?, pos_y = ?, label = ? WHERE id = ?').run(data.seats, data.shape, data.pos_x, data.pos_y, data.label || null, exists.id);
      id = exists.id;
    } else {
      id = Number(
        db.prepare('INSERT INTO dining_tables (sector_id, number, label, seats, shape, pos_x, pos_y, qr_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(data.sector_id, data.number, data.label || null, data.seats, data.shape, data.pos_x, data.pos_y, randomToken(18)).lastInsertRowid,
      );
    }
    audit(user.id, 'crear_mesa', 'table', id, { number: data.number });
    changed();
    return id;
  },

  updateTable(user, id, data) {
    const t = repo.table(id);
    if (!t) throw notFound('Mesa inexistente');
    getDb()
      .prepare('UPDATE dining_tables SET sector_id = ?, number = ?, label = ?, seats = ?, shape = ? WHERE id = ?')
      .run(data.sector_id, data.number, data.label || null, data.seats, data.shape, id);
    audit(user.id, 'editar_mesa', 'table', id, data);
    changed();
  },

  savePositions(user, positions) {
    const stmt = getDb().prepare('UPDATE dining_tables SET pos_x = ?, pos_y = ? WHERE id = ?');
    tx(() => positions.forEach((p) => stmt.run(p.pos_x, p.pos_y, p.id)));
    audit(user.id, 'mover_mesas', 'table', null, { count: positions.length });
    changed();
  },

  deleteTable(user, id) {
    if (repo.activeSessionOf(id)) throw conflict('La mesa tiene una cuenta abierta');
    getDb().prepare('UPDATE dining_tables SET active = 0 WHERE id = ?').run(id);
    audit(user.id, 'eliminar_mesa', 'table', id);
    changed();
  },

  regenerateQr(user, id) {
    if (!repo.table(id)) throw notFound('Mesa inexistente');
    getDb().prepare('UPDATE dining_tables SET qr_token = ? WHERE id = ?').run(randomToken(18), id);
    audit(user.id, 'regenerar_qr', 'table', id);
    changed();
  },
};
