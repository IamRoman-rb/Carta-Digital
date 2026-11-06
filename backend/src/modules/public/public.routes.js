/**
 * API pública para comensales. La carta es libre; para operar sobre una mesa hay que
 * escanear su QR (token aleatorio no adivinable) y presentar el pase de mesa resultante. No se recolectan datos personales
 * (Ley 25.326 – minimización de datos).
 */
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db/connection.js';
import { forbidden, conflict } from '../../core/errors.js';
import { eventBus, Events } from '../../core/eventBus.js';
import { publicLimiter } from '../../middleware/rateLimiters.js';
import { validate } from '../../middleware/validate.js';
import { menuService } from '../menu/menu.service.js';
import { settingsService } from '../settings/settings.service.js';
import { floorRepository } from '../floor/floor.repository.js';
import { calculateBill } from '../billing/billCalculator.js';
import { ordersService, orderItemsSchema } from '../orders/orders.service.js';
import { checkinService, requireCheckin } from './checkin.service.js';

export const publicRouter = Router();
publicRouter.use(publicLimiter);

function tableView(table) {
  const session = floorRepository.activeSessionOf(table.id);
  const waiter = session?.waiter_id ? getDb().prepare('SELECT name FROM users WHERE id = ?').pluck().get(session.waiter_id) : null;
  return {
    table: { number: table.number, label: table.label, sector: table.sector_name, seats: table.seats },
    session: session
      ? { status: session.status, guests: session.guests, opened_at: session.opened_at, waiter_name: waiter, tables: floorRepository.tablesOfSession(session.id).map((t) => t.number) }
      : null,
    ordering_enabled: settingsService.get('customer_ordering_enabled'),
  };
}

publicRouter.get('/menu', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
  res.json({ ...menuService.publicMenu(), settings: settingsService.publicView() });
});

/**
 * Check-in: el comensal escanea el QR impreso en su mesa (con la cámara del celular o desde la carta)
 * y recibe un pase de mesa. Sin ese pase no se puede pedir, llamar al mozo ni pedir la cuenta.
 */
publicRouter.post('/checkin', validate(z.object({ qr: z.string().trim().min(8).max(64).regex(/^[\w-]+$/, 'Código QR inválido') })), (req, res) => {
  const { table, pass, expiresAt } = checkinService.issue(req.body.qr);
  res.set('Cache-Control', 'no-store');
  res.status(201).json({ pass, expires_at: expiresAt, ...tableView(table) });
});

// Todo lo que sigue requiere haber escaneado el QR de la mesa.
publicRouter.use('/table', requireCheckin);

publicRouter.get('/table', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(tableView(req.table));
});

publicRouter.get('/table/order', (req, res) => {
  const { table } = req;
  const session = floorRepository.activeSessionOf(table.id);
  res.set('Cache-Control', 'no-store');
  if (!session) return res.json({ session: null });
  const bill = calculateBill(session.id);
  const calls = getDb().prepare("SELECT type, created_at FROM service_calls WHERE session_id = ? AND status = 'pendiente'").all(session.id);
  res.json({
    session: { status: session.status, guests: session.guests, opened_at: session.opened_at },
    items: bill.items.map((i) => ({
      id: i.id, name: i.name, quantity: i.quantity, unit_price: i.unit_price, line_total: i.line_total,
      modifiers: i.modifiers.map((m) => m.name), notes: i.notes, status: i.status, created_at: i.created_at, promo: i.promo,
    })),
    totals: { subtotal: bill.subtotal, discount: bill.discount, total: bill.total, paid: bill.paid, balance: bill.balance, vat_contained: bill.vatTotal },
    pending_calls: calls,
  });
});

publicRouter.post('/table/orders', validate(orderItemsSchema), (req, res) => {
  const { table } = req;
  if (!settingsService.get('customer_ordering_enabled')) throw forbidden('El pedido desde la mesa no está habilitado. Llamá al mozo.');
  const session = floorRepository.activeSessionOf(table.id);
  if (!session) throw conflict('La mesa todavía no fue habilitada. Pedile al mozo que la abra para poder pedir.');
  const orderId = ordersService.create({ sessionId: session.id, source: 'cliente', items: req.body.items, notes: req.body.notes });
  res.status(201).json({ orderId });
});

publicRouter.post(
  '/table/calls',
  validate(
    z.object({
      type: z.enum(['mozo', 'cuenta']),
      detail: z
        .object({
          method: z.enum(['efectivo', 'debito', 'credito', 'qr', 'transferencia']).optional(),
          tip_pct: z.coerce.number().min(0).max(100).optional(),
          split: z.string().trim().max(60).optional(),
          reason: z.string().trim().max(60).optional(),
        })
        .optional(),
    }),
  ),
  (req, res) => {
    const { table } = req;
    const session = floorRepository.activeSessionOf(table.id);
    const db = getDb();
    const existing = db.prepare("SELECT id FROM service_calls WHERE table_id = ? AND type = ? AND status = 'pendiente'").get(table.id, req.body.type);
    if (existing) return res.json({ callId: existing.id, duplicated: true });
    const id = Number(
      db.prepare('INSERT INTO service_calls (session_id, table_id, type, detail) VALUES (?, ?, ?, ?)')
        .run(session?.id ?? null, table.id, req.body.type, req.body.detail ? JSON.stringify(req.body.detail) : null).lastInsertRowid,
    );
    if (req.body.type === 'cuenta' && session) db.prepare("UPDATE table_sessions SET status = 'billing' WHERE id = ?").run(session.id);
    eventBus.publish(Events.CALL_CREATED, { callId: id, table: table.number, type: req.body.type });
    eventBus.publish(Events.TABLES_CHANGED, { sessionId: session?.id });
    res.status(201).json({ callId: id, duplicated: false });
  },
);
