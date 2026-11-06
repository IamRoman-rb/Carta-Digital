import { getDb } from '../../db/connection.js';
import { badRequest } from '../../core/errors.js';
import { rangeIso, localParts } from '../../core/time.js';

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

function previousRange(fromYmd, toYmd) {
  const days = Math.round((new Date(toYmd) - new Date(fromYmd)) / 86_400_000) + 1;
  const prevTo = new Date(new Date(fromYmd).getTime() - 86_400_000);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86_400_000);
  const ymd = (d) => d.toISOString().slice(0, 10);
  return rangeIso(ymd(prevFrom), ymd(prevTo));
}

/**
 * Ingeniería de menú (Kasavana & Smith):
 * popularidad alta si la participación >= 70% de la participación media;
 * margen alto si la contribución unitaria >= contribución media ponderada.
 */
function menuEngineering(products) {
  if (!products.length) return products;
  const totalQty = products.reduce((s, p) => s + p.quantity, 0);
  const popularityThreshold = (1 / products.length) * 0.7;
  const totalContribution = products.reduce((s, p) => s + (p.revenue - p.cost), 0);
  const avgContribution = totalQty ? totalContribution / totalQty : 0;
  return products.map((p) => {
    const unitContribution = p.quantity ? (p.revenue - p.cost) / p.quantity : 0;
    const popular = totalQty ? p.quantity / totalQty >= popularityThreshold : false;
    const profitable = unitContribution >= avgContribution;
    const quadrant = popular && profitable ? 'estrella' : popular ? 'caballo' : profitable ? 'puzzle' : 'perro';
    return { ...p, unit_contribution: Math.round(unitContribution), quadrant };
  });
}

export const reportsService = {
  summary(fromYmd, toYmd) {
    if (fromYmd > toYmd) throw badRequest('La fecha inicial es posterior a la final');
    const { from, to } = rangeIso(fromYmd, toYmd);
    const prev = previousRange(fromYmd, toYmd);
    const db = getDb();

    const payments = db.prepare('SELECT amount, tip, method, created_at FROM payments WHERE created_at >= ? AND created_at < ?').all(from, to);
    const revenue = payments.reduce((s, p) => s + p.amount, 0);
    const tips = payments.reduce((s, p) => s + p.tip, 0);
    const prevRevenue = db.prepare('SELECT COALESCE(SUM(amount),0) FROM payments WHERE created_at >= ? AND created_at < ?').pluck().get(prev.from, prev.to);

    const sessions = db
      .prepare(
        `SELECT s.id, s.guests, s.opened_at, s.closed_at, s.waiter_id FROM table_sessions s
         WHERE s.status = 'closed' AND s.merged_into IS NULL AND s.closed_at >= ? AND s.closed_at < ?
         AND EXISTS (SELECT 1 FROM tickets t WHERE t.session_id = s.id AND t.kind = 'comprobante')`,
      )
      .all(from, to);
    const tickets = sessions.length;
    const guests = sessions.reduce((s, x) => s + x.guests, 0);
    const avgStay = tickets ? Math.round(sessions.reduce((s, x) => s + (new Date(x.closed_at) - new Date(x.opened_at)), 0) / tickets / 60_000) : 0;

    const itemRows = db
      .prepare(
        `SELECT i.product_id, i.name, i.quantity, i.unit_price, i.unit_cost, i.status, i.created_at, i.ready_at, c.name AS category
         FROM order_items i JOIN orders o ON o.id = i.order_id JOIN table_sessions s ON s.id = o.session_id
         LEFT JOIN products p ON p.id = i.product_id LEFT JOIN categories c ON c.id = p.category_id
         WHERE s.status = 'closed' AND s.closed_at >= ? AND s.closed_at < ?`,
      )
      .all(from, to);
    const sold = itemRows.filter((i) => i.status !== 'anulado');
    const itemsRevenue = sold.reduce((s, i) => s + i.unit_price * i.quantity, 0);
    const itemsCost = sold.reduce((s, i) => s + i.unit_cost * i.quantity, 0);

    const productMap = new Map();
    const categoryMap = new Map();
    for (const i of sold) {
      const key = i.product_id ?? i.name;
      const cur = productMap.get(key) ?? { product_id: i.product_id, name: i.name, category: i.category ?? '—', quantity: 0, revenue: 0, cost: 0, prep: [] };
      cur.quantity += i.quantity;
      cur.revenue += i.unit_price * i.quantity;
      cur.cost += i.unit_cost * i.quantity;
      if (i.ready_at) cur.prep.push((new Date(i.ready_at) - new Date(i.created_at)) / 60_000);
      productMap.set(key, cur);
      categoryMap.set(i.category ?? '—', (categoryMap.get(i.category ?? '—') ?? 0) + i.unit_price * i.quantity);
    }
    const products = menuEngineering(
      [...productMap.values()].map(({ prep, ...p }) => ({
        ...p,
        margin_pct: pct(p.revenue - p.cost, p.revenue),
        avg_prep_minutes: prep.length ? Math.round((prep.reduce((a, b) => a + b, 0) / prep.length) * 10) / 10 : null,
      })),
    ).sort((a, b) => b.revenue - a.revenue);

    const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, tables: 0 }));
    for (const p of payments) byHour[localParts(new Date(p.created_at)).hour].revenue += p.amount;
    for (const s of sessions) byHour[localParts(new Date(s.opened_at)).hour].tables += 1;

    const byDayMap = new Map();
    for (const p of payments) {
      const lp = localParts(new Date(p.created_at));
      const key = `${lp.year}-${String(lp.month).padStart(2, '0')}-${String(lp.day).padStart(2, '0')}`;
      byDayMap.set(key, (byDayMap.get(key) ?? 0) + p.amount);
    }

    const byMethod = Object.values(
      payments.reduce((acc, p) => {
        acc[p.method] ??= { method: p.method, amount: 0, count: 0 };
        acc[p.method].amount += p.amount;
        acc[p.method].count += 1;
        return acc;
      }, {}),
    ).map((m) => ({ ...m, share: pct(m.amount, revenue) }));

    const waiters = db
      .prepare(
        `SELECT u.id, u.name, COUNT(DISTINCT s.id) AS tables, COALESCE(SUM(p.amount),0) AS revenue, COALESCE(SUM(p.tip),0) AS tips
         FROM table_sessions s JOIN users u ON u.id = s.waiter_id JOIN payments p ON p.session_id = s.id
         WHERE p.created_at >= ? AND p.created_at < ? GROUP BY u.id ORDER BY revenue DESC`,
      )
      .all(from, to)
      .map((w) => ({ ...w, avg_ticket: w.tables ? Math.round(w.revenue / w.tables) : 0 }));

    const prepTimes = sold.filter((i) => i.ready_at).map((i) => (new Date(i.ready_at) - new Date(i.created_at)) / 60_000);
    const cancelled = itemRows.filter((i) => i.status === 'anulado').length;

    return {
      range: { from: fromYmd, to: toYmd },
      kpis: {
        revenue,
        prev_revenue: prevRevenue,
        revenue_change_pct: prevRevenue ? pct(revenue - prevRevenue, prevRevenue) : null,
        tips,
        tickets,
        avg_ticket: tickets ? Math.round(revenue / tickets) : 0,
        guests,
        avg_per_guest: guests ? Math.round(revenue / guests) : 0,
        avg_stay_minutes: avgStay,
        gross_margin_pct: pct(itemsRevenue - itemsCost, itemsRevenue),
        items_sold: sold.reduce((s, i) => s + i.quantity, 0),
      },
      by_hour: byHour,
      by_day: [...byDayMap.entries()].sort().map(([day, amount]) => ({ day, amount })),
      by_method: byMethod.sort((a, b) => b.amount - a.amount),
      by_category: [...categoryMap.entries()].map(([name, amount]) => ({ name, amount, share: pct(amount, itemsRevenue) })).sort((a, b) => b.amount - a.amount),
      products,
      waiters,
      kitchen: {
        avg_prep_minutes: prepTimes.length ? Math.round((prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length) * 10) / 10 : null,
        cancelled_items: cancelled,
        cancelled_pct: pct(cancelled, itemRows.length),
        slowest: products.filter((p) => p.avg_prep_minutes != null).sort((a, b) => b.avg_prep_minutes - a.avg_prep_minutes).slice(0, 5),
      },
    };
  },

  /** CSV compatible con Excel (separador ";", BOM UTF-8, decimales con coma). */
  csv(fromYmd, toYmd) {
    const r = this.summary(fromYmd, toYmd);
    const money = (c) => (c / 100).toFixed(2).replace('.', ',');
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      [`Informe ${fromYmd} a ${toYmd}`],
      [],
      ['Indicador', 'Valor'],
      ['Facturación', money(r.kpis.revenue)],
      ['Propinas', money(r.kpis.tips)],
      ['Cuentas cerradas', r.kpis.tickets],
      ['Ticket promedio', money(r.kpis.avg_ticket)],
      ['Comensales', r.kpis.guests],
      ['Margen bruto %', String(r.kpis.gross_margin_pct).replace('.', ',')],
      [],
      ['Producto', 'Categoría', 'Cantidad', 'Ventas', 'Costo', 'Margen %', 'Clasificación'],
      ...r.products.map((p) => [p.name, p.category, p.quantity, money(p.revenue), money(p.cost), String(p.margin_pct).replace('.', ','), p.quadrant]),
      [],
      ['Día', 'Facturación'],
      ...r.by_day.map((d) => [d.day, money(d.amount)]),
      [],
      ['Medio de pago', 'Operaciones', 'Importe'],
      ...r.by_method.map((m) => [m.method, m.count, money(m.amount)]),
    ];
    return '﻿' + rows.map((row) => row.map(esc).join(';')).join('\r\n');
  },
};
