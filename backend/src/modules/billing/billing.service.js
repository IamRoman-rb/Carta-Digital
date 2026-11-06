import { env } from '../../config/env.js';
import { getDb, tx } from '../../db/connection.js';
import { badRequest, conflict, notFound } from '../../core/errors.js';
import { eventBus, Events } from '../../core/eventBus.js';
import { audit, nowIso, parseJson } from '../../core/utils.js';
import { settingsService } from '../settings/settings.service.js';
import { floorRepository } from '../floor/floor.repository.js';
import { calculateBill } from './billCalculator.js';
import { quote } from './splitStrategies.js';
import { cashService } from './cash.service.js';
import { ticketFactory, normalizeReceiver } from './fiscal/ticketFactory.js';
import { fiscalProvider, nextNumber } from './fiscal/fiscalProviders.js';

function openBill(sessionId) {
  const bill = calculateBill(sessionId);
  if (!bill) throw notFound('Cuenta inexistente');
  if (bill.status === 'closed') throw conflict('La cuenta ya está cerrada');
  return bill;
}

function context(sessionId) {
  const s = getDb()
    .prepare('SELECT s.*, u.name AS waiter_name FROM table_sessions s LEFT JOIN users u ON u.id = s.waiter_id WHERE s.id = ?')
    .get(sessionId);
  const tables = floorRepository.tablesOfSession(sessionId);
  return {
    session_id: sessionId,
    tables: tables.map((t) => t.number),
    sector: tables[0]?.sector_name ?? '',
    waiter: s.waiter_name,
    guests: s.guests,
    opened_at: s.opened_at,
  };
}

function storeTicket(sessionId, doc, userId) {
  const id = getDb()
    .prepare(
      `INSERT INTO tickets (session_id, kind, cbte_tipo, letter, pos_number, number, total, cae, cae_due, payload, issued_by, issued_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(sessionId, doc.kind, doc.code ?? null, doc.letter, doc.pos, doc.number, doc.totals.total, doc.cae ?? null, doc.cae_due ?? null, JSON.stringify(doc), userId, doc.issued_at)
    .lastInsertRowid;
  return { id: Number(id), ...doc };
}

function attendCalls(sessionId, userId, type) {
  getDb()
    .prepare(`UPDATE service_calls SET status = 'atendida', attended_at = ?, attended_by = ? WHERE session_id = ? AND status = 'pendiente' ${type ? 'AND type = ?' : ''}`)
    .run(nowIso(), userId, sessionId, ...(type ? [type] : []));
}

export const billingService = {
  bill(sessionId) {
    const bill = calculateBill(sessionId);
    if (!bill) throw notFound('Cuenta inexistente');
    return { ...bill, context: context(sessionId), tickets: this.ticketsOf(sessionId) };
  },

  quote(sessionId, mode, options) {
    const bill = openBill(sessionId);
    return { amount: quote(bill, mode, options), balance: bill.balance, total: bill.total };
  },

  applyDiscount(user, sessionId, percent, reason) {
    const bill = openBill(sessionId);
    if (bill.paid > 0) throw conflict('No se puede modificar el descuento con pagos registrados');
    getDb().prepare('UPDATE table_sessions SET discount_pct = ?, discount_reason = ? WHERE id = ?').run(percent, reason || null, sessionId);
    audit(user.id, 'aplicar_descuento', 'session', sessionId, { percent, reason });
    eventBus.publish(Events.TABLES_CHANGED, { sessionId });
    return calculateBill(sessionId);
  },

  registerPayment(user, sessionId, { method, amount, tip, received, reference }) {
    return tx(() => {
      const cash = cashService.requireOpen();
      const bill = openBill(sessionId);
      if (bill.total === 0) throw badRequest('La cuenta no tiene importe a cobrar');
      if (amount > bill.balance) throw badRequest('El importe supera el saldo pendiente');
      let change = null;
      if (method === 'efectivo') {
        const due = amount + tip;
        const got = received ?? due;
        if (got < due) throw badRequest('El efectivo recibido no alcanza');
        change = got - due;
        received = got;
      } else received = null;
      const id = getDb()
        .prepare('INSERT INTO payments (session_id, cash_session_id, method, amount, tip, received, change_given, reference, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(sessionId, cash.id, method, amount, tip, received, change, reference || null, user.id).lastInsertRowid;
      audit(user.id, 'registrar_pago', 'payment', Number(id), { sessionId, method, amount, tip });
      eventBus.publish(Events.TABLES_CHANGED, { sessionId });
      eventBus.publish(Events.CASH_CHANGED);
      return { paymentId: Number(id), change, bill: calculateBill(sessionId) };
    });
  },

  precuenta(user, sessionId) {
    return tx(() => {
      const bill = openBill(sessionId);
      if (!bill.items.length) throw badRequest('La cuenta no tiene consumos');
      const settings = settingsService.all();
      const doc = ticketFactory.precuenta({ bill, settings, context: context(sessionId), number: nextNumber('precuenta', 'X', settings.pos_number) });
      const ticket = storeTicket(sessionId, doc, user.id);
      getDb().prepare("UPDATE table_sessions SET status = 'billing' WHERE id = ?").run(sessionId);
      audit(user.id, 'emitir_precuenta', 'ticket', ticket.id, { sessionId });
      eventBus.publish(Events.TABLES_CHANGED, { sessionId });
      return ticket;
    });
  },

  /** Cierra la cuenta: emite el comprobante final y libera las mesas. */
  close(user, sessionId, receiverInput) {
    return tx(() => {
      const bill = openBill(sessionId);
      if (!bill.items.length) throw badRequest('La cuenta no tiene consumos. Usá "Liberar mesa".');
      if (bill.balance > 0) throw conflict(`Falta cobrar ${(bill.balance / 100).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}`);
      const pending = bill.items.filter((i) => ['pendiente', 'preparando'].includes(i.status)).length;
      if (pending) throw conflict('Hay platos en preparación. Entregalos o anulalos antes de cerrar.');
      const settings = settingsService.all();
      const receiver = normalizeReceiver(receiverInput, bill.total, settings.cf_id_threshold);
      const authorization = fiscalProvider(env.FISCAL_PROVIDER).authorize({ kind: 'comprobante', pos: settings.pos_number, bill, receiver, settings });
      const doc = ticketFactory.comprobante({ bill, settings, context: context(sessionId), receiver, authorization });
      const ticket = storeTicket(sessionId, doc, user.id);
      const db = getDb();
      db.prepare("UPDATE order_items SET status = 'entregado', delivered_at = COALESCE(delivered_at, ?) WHERE status = 'listo' AND order_id IN (SELECT id FROM orders WHERE session_id = ?)").run(nowIso(), sessionId);
      floorRepository.markReleased(floorRepository.activeTableIdsOfSession(sessionId));
      db.prepare('UPDATE session_tables SET active = 0 WHERE session_id = ?').run(sessionId);
      db.prepare("UPDATE table_sessions SET status = 'closed', closed_at = ?, closed_by = ? WHERE id = ?").run(nowIso(), user.id, sessionId);
      attendCalls(sessionId, user.id);
      audit(user.id, 'cerrar_cuenta', 'session', sessionId, { ticketId: ticket.id, total: bill.total });
      eventBus.publish(Events.SESSION_CLOSED, { sessionId });
      eventBus.publish(Events.TABLES_CHANGED, { sessionId });
      return ticket;
    });
  },

  ticketsOf(sessionId) {
    return getDb().prepare('SELECT id, kind, letter, pos_number, number, total, issued_at FROM tickets WHERE session_id = ? ORDER BY id').all(sessionId);
  },

  ticket(id) {
    const row = getDb().prepare('SELECT * FROM tickets WHERE id = ?').get(id);
    if (!row) throw notFound('Comprobante inexistente');
    return { id: row.id, ...parseJson(row.payload, {}) };
  },

  recentTickets(limit = 50) {
    return getDb()
      .prepare(
        `SELECT t.id, t.kind, t.letter, t.pos_number, t.number, t.total, t.issued_at, u.name AS issued_by_name
         FROM tickets t LEFT JOIN users u ON u.id = t.issued_by ORDER BY t.id DESC LIMIT ?`,
      )
      .all(limit);
  },
};
