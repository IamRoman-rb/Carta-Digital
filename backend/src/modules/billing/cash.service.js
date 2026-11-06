/** Caja: apertura, arqueo (reporte X) y cierre (reporte Z). */
import { getDb } from '../../db/connection.js';
import { badRequest, conflict } from '../../core/errors.js';
import { eventBus, Events } from '../../core/eventBus.js';
import { audit, nowIso } from '../../core/utils.js';

function summary(cash) {
  const db = getDb();
  const byMethod = db
    .prepare('SELECT method, COUNT(*) AS count, SUM(amount) AS amount, SUM(tip) AS tips FROM payments WHERE cash_session_id = ? GROUP BY method')
    .all(cash.id);
  const totals = byMethod.reduce((t, m) => ({ amount: t.amount + m.amount, tips: t.tips + m.tips, count: t.count + m.count }), { amount: 0, tips: 0, count: 0 });
  const cashIn = byMethod.filter((m) => m.method === 'efectivo').reduce((s, m) => s + m.amount + m.tips, 0);
  const tickets = db.prepare("SELECT COUNT(*) FROM tickets WHERE kind = 'comprobante' AND issued_at >= ? AND (? IS NULL OR issued_at <= ?)").pluck().get(cash.opened_at, cash.closed_at, cash.closed_at);
  return {
    ...cash,
    opened_by_name: db.prepare('SELECT name FROM users WHERE id = ?').pluck().get(cash.opened_by),
    by_method: byMethod,
    totals,
    tickets,
    expected_cash: cash.opening_amount + cashIn,
    average_ticket: tickets ? Math.round(totals.amount / tickets) : 0,
  };
}

export const cashService = {
  current() {
    const cash = getDb().prepare('SELECT * FROM cash_sessions WHERE closed_at IS NULL').get();
    return cash ? summary(cash) : null;
  },

  requireOpen() {
    const cash = getDb().prepare('SELECT * FROM cash_sessions WHERE closed_at IS NULL').get();
    if (!cash) throw conflict('La caja está cerrada. Abrí la caja para registrar cobros.');
    return cash;
  },

  open(user, openingAmount) {
    if (this.current()) throw conflict('Ya hay una caja abierta');
    const id = Number(getDb().prepare('INSERT INTO cash_sessions (opened_by, opening_amount) VALUES (?, ?)').run(user.id, openingAmount).lastInsertRowid);
    audit(user.id, 'abrir_caja', 'cash', id, { openingAmount });
    eventBus.publish(Events.CASH_CHANGED);
    return this.current();
  },

  close(user, countedCash, notes) {
    const cur = this.current();
    if (!cur) throw badRequest('No hay una caja abierta');
    getDb()
      .prepare('UPDATE cash_sessions SET closed_at = ?, closed_by = ?, expected_cash = ?, counted_cash = ?, notes = ? WHERE id = ?')
      .run(nowIso(), user.id, cur.expected_cash, countedCash, notes || null, cur.id);
    audit(user.id, 'cerrar_caja', 'cash', cur.id, { expected: cur.expected_cash, counted: countedCash });
    eventBus.publish(Events.CASH_CHANGED);
    const closed = getDb().prepare('SELECT * FROM cash_sessions WHERE id = ?').get(cur.id);
    return { ...summary(closed), difference: countedCash - cur.expected_cash };
  },

  history(limit = 20) {
    return getDb()
      .prepare(
        `SELECT c.*, u.name AS opened_by_name, cu.name AS closed_by_name,
                (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.cash_session_id = c.id) AS total
         FROM cash_sessions c JOIN users u ON u.id = c.opened_by LEFT JOIN users cu ON cu.id = c.closed_by
         ORDER BY c.id DESC LIMIT ?`,
      )
      .all(limit);
  },
};
