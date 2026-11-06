/**
 * Cálculo de la cuenta de una sesión de mesa.
 * Precios de carta = precio final con IVA incluido (Ley 24.240, Res. SCI 7/2002).
 * El IVA contenido se discrimina por alícuota (Ley 27.743 – Transparencia Fiscal al Consumidor).
 */
import { getDb } from '../../db/connection.js';
import { parseJson } from '../../core/utils.js';

export function sessionItems(sessionId, { includeCancelled = false } = {}) {
  return getDb()
    .prepare(
      `SELECT i.*, o.source, o.created_at AS order_created_at
       FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE o.session_id = ? ${includeCancelled ? '' : "AND i.status != 'anulado'"}
       ORDER BY i.id`,
    )
    .all(sessionId)
    .map((i) => ({ ...i, modifiers: parseJson(i.modifiers, []), line_total: i.unit_price * i.quantity }));
}

/** Discrimina neto e IVA de un importe final según alícuota. */
export function splitVat(gross, rate) {
  const net = Math.round(gross / (1 + rate / 100));
  return { net, vat: gross - net };
}

export function calculateBill(sessionId) {
  const db = getDb();
  const session = db.prepare('SELECT * FROM table_sessions WHERE id = ?').get(sessionId);
  if (!session) return null;
  const items = sessionItems(sessionId);
  const subtotal = items.reduce((s, i) => s + i.line_total, 0);
  const discount = Math.round((subtotal * (session.discount_pct || 0)) / 100);
  const total = subtotal - discount;
  const factor = subtotal ? total / subtotal : 1;

  // IVA por alícuota, prorrateando el descuento.
  const vatMap = new Map();
  for (const i of items) {
    const gross = Math.round(i.line_total * factor);
    const cur = vatMap.get(i.vat_rate) ?? 0;
    vatMap.set(i.vat_rate, cur + gross);
  }
  const vatBreakdown = [...vatMap.entries()].map(([rate, gross]) => ({ rate, gross, ...splitVat(gross, rate) }));
  const vatTotal = vatBreakdown.reduce((s, v) => s + v.vat, 0);

  const payments = db.prepare('SELECT * FROM payments WHERE session_id = ? ORDER BY id').all(sessionId);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const tips = payments.reduce((s, p) => s + p.tip, 0);

  return {
    sessionId,
    status: session.status,
    guests: session.guests,
    items,
    subtotal,
    discountPct: session.discount_pct || 0,
    discountReason: session.discount_reason,
    discount,
    total,
    vatBreakdown,
    vatTotal,
    netTotal: total - vatTotal,
    payments,
    paid,
    tips,
    balance: Math.max(0, total - paid),
  };
}
