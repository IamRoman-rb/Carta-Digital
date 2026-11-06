import { z } from 'zod';
import { getDb, tx } from '../../db/connection.js';
import { badRequest, conflict, forbidden, notFound } from '../../core/errors.js';
import { eventBus, Events } from '../../core/eventBus.js';
import { audit, nowIso, parseJson } from '../../core/utils.js';
import { rangeIso, todayYmd } from '../../core/time.js';
import { menuRepository } from '../menu/menu.repository.js';
import { pricingService } from '../menu/pricing.service.js';
import { floorRepository } from '../floor/floor.repository.js';

export const orderItemsSchema = z.object({
  notes: z.string().trim().max(200).optional(),
  items: z
    .array(
      z.object({
        product_id: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int().min(1).max(50),
        modifiers: z.array(z.coerce.number().int().positive()).max(30).default([]),
        notes: z.string().trim().max(200).optional().default(''),
      }),
    )
    .min(1)
    .max(60),
});

const FLOW = ['pendiente', 'preparando', 'listo', 'entregado'];

/** Construye las líneas de pedido validando disponibilidad y modificadores. */
function buildLines(items) {
  const products = new Map(menuRepository.findProductsByIds([...new Set(items.map((i) => i.product_id))]).map((p) => [p.id, p]));
  const promos = pricingService.activePromotions();
  return items.map((item) => {
    const p = products.get(item.product_id);
    if (!p || !p.available) throw badRequest(`"${p?.name ?? 'Producto'}" no está disponible en este momento`);
    const chosen = [];
    for (const g of p.modifier_groups) {
      const picked = g.options.filter((o) => item.modifiers.includes(o.id));
      if (picked.length < g.min_select) throw badRequest(`"${p.name}": elegí ${g.min_select === 1 ? 'una opción' : `${g.min_select} opciones`} de ${g.name}`);
      if (picked.length > g.max_select) throw badRequest(`"${p.name}": máximo ${g.max_select} en ${g.name}`);
      chosen.push(...picked.map((o) => ({ group: g.name, name: o.name, price_delta: o.price_delta })));
    }
    const validIds = new Set(p.modifier_groups.flatMap((g) => g.options.map((o) => o.id)));
    if (item.modifiers.some((m) => !validIds.has(m))) throw badRequest(`"${p.name}": opción inválida`);
    const { finalPrice, promo } = pricingService.priceFor(p, promos);
    const comboDetail = p.is_combo
      ? menuRepository.findProductsByIds(p.combo_items.map((c) => c.product_id)).map((cp) => ({
          group: 'Incluye',
          name: `${p.combo_items.find((c) => c.product_id === cp.id).quantity}x ${cp.name}`,
          price_delta: 0,
        }))
      : [];
    return {
      product_id: p.id,
      name: p.name,
      unit_price: finalPrice + chosen.reduce((s, c) => s + c.price_delta, 0),
      unit_cost: p.cost,
      vat_rate: p.vat_rate,
      quantity: item.quantity,
      modifiers: [...comboDetail, ...chosen],
      notes: item.notes || null,
      station: p.station,
      promo: promo ? `${promo.name} (-${promo.percent}%)` : null,
    };
  });
}

function boardRows(where, params = []) {
  return getDb()
    .prepare(
      `SELECT i.*, o.session_id, o.source, o.notes AS order_notes, o.created_at AS order_created_at, u.name AS waiter_name, cu.name AS created_by_name
       FROM order_items i JOIN orders o ON o.id = i.order_id JOIN table_sessions s ON s.id = o.session_id
       LEFT JOIN users u ON u.id = s.waiter_id LEFT JOIN users cu ON cu.id = o.created_by
       WHERE ${where} ORDER BY o.created_at, i.id`,
    )
    .all(...params);
}

export const ordersService = {
  create({ sessionId, source, user = null, items, notes }) {
    return tx(() => {
      const session = floorRepository.session(sessionId);
      if (!session || session.status === 'closed') throw conflict('La mesa no tiene una cuenta abierta');
      const lines = buildLines(items);
      const db = getDb();
      const orderId = Number(db.prepare('INSERT INTO orders (session_id, source, created_by, notes) VALUES (?, ?, ?, ?)').run(sessionId, source, user?.id ?? null, notes || null).lastInsertRowid);
      const ins = db.prepare(
        `INSERT INTO order_items (order_id, product_id, name, unit_price, unit_cost, vat_rate, quantity, modifiers, notes, station, promo)
         VALUES (@order_id, @product_id, @name, @unit_price, @unit_cost, @vat_rate, @quantity, @modifiers, @notes, @station, @promo)`,
      );
      for (const l of lines) ins.run({ ...l, order_id: orderId, modifiers: JSON.stringify(l.modifiers) });
      if (session.status === 'billing') db.prepare("UPDATE table_sessions SET status = 'open' WHERE id = ?").run(sessionId);
      if (user) audit(user.id, 'crear_pedido', 'order', orderId, { sessionId, items: lines.length });
      const tables = floorRepository.tablesOfSession(sessionId).map((t) => t.number);
      eventBus.publish(Events.ORDER_CREATED, { orderId, sessionId, source, tables });
      eventBus.publish(Events.TABLES_CHANGED, { sessionId });
      return orderId;
    });
  },

  /** Comandas activas agrupadas por ticket para el KDS. */
  kitchenBoard(station) {
    const params = [];
    let where = "i.status IN ('pendiente','preparando','listo') AND s.status != 'closed'";
    if (station) {
      where += ' AND i.station = ?';
      params.push(station);
    }
    const rows = boardRows(where, params);
    const tickets = new Map();
    for (const r of rows) {
      if (!tickets.has(r.order_id)) {
        tickets.set(r.order_id, {
          order_id: r.order_id,
          session_id: r.session_id,
          source: r.source,
          notes: r.order_notes,
          created_at: r.order_created_at,
          waiter_name: r.waiter_name,
          created_by_name: r.created_by_name,
          tables: floorRepository.tablesOfSession(r.session_id),
          items: [],
        });
      }
      tickets.get(r.order_id).items.push({
        id: r.id, product_id: r.product_id, name: r.name, quantity: r.quantity, modifiers: parseJson(r.modifiers, []), notes: r.notes,
        station: r.station, status: r.status, created_at: r.created_at, started_at: r.started_at, ready_at: r.ready_at,
      });
    }
    const batch = getDb()
      .prepare(
        `SELECT i.name, i.station, SUM(i.quantity) AS quantity,
                SUM(CASE WHEN i.status = 'preparando' THEN i.quantity ELSE 0 END) AS in_progress
         FROM order_items i JOIN orders o ON o.id = i.order_id JOIN table_sessions s ON s.id = o.session_id
         WHERE i.status IN ('pendiente','preparando') AND s.status != 'closed' ${station ? 'AND i.station = ?' : ''}
         GROUP BY i.product_id, i.name, i.station ORDER BY quantity DESC LIMIT 12`,
      )
      .all(...(station ? [station] : []));
    const { from, to } = rangeIso(todayYmd(), todayYmd());
    const stats = getDb()
      .prepare(
        `SELECT AVG((julianday(ready_at) - julianday(created_at)) * 1440) AS avg_minutes, COUNT(*) AS done
         FROM order_items WHERE ready_at IS NOT NULL AND created_at >= ? AND created_at < ?`,
      )
      .get(from, to);
    const stations = getDb()
      .prepare(
        `SELECT i.station, COUNT(DISTINCT i.order_id) AS tickets FROM order_items i JOIN orders o ON o.id = i.order_id
         JOIN table_sessions s ON s.id = o.session_id WHERE i.status IN ('pendiente','preparando') AND s.status != 'closed' GROUP BY i.station`,
      )
      .all();
    return { tickets: [...tickets.values()], batch, stats, stations };
  },

  setItemStatus(user, itemId, status, reason) {
    return tx(() => {
      const db = getDb();
      const item = db.prepare('SELECT i.*, o.session_id FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.id = ?').get(itemId);
      if (!item) throw notFound('Ítem inexistente');
      if (item.status === 'anulado') throw conflict('El ítem está anulado');
      if (status === 'anulado') {
        const needsOverride = item.status !== 'pendiente';
        if (needsOverride && !user.permissions.has('pedidos.anular')) throw forbidden('Anular un plato ya marchado requiere autorización de un encargado');
        if (!reason) throw badRequest('Indicá el motivo de la anulación');
        db.prepare("UPDATE order_items SET status = 'anulado', cancelled_by = ?, cancel_reason = ? WHERE id = ?").run(user.id, reason, itemId);
        audit(user.id, 'anular_item', 'order_item', itemId, { name: item.name, from: item.status, reason });
      } else {
        const from = FLOW.indexOf(item.status);
        const to = FLOW.indexOf(status);
        // Avanzar: cualquier cantidad de pasos. Retroceder: solo un paso (corrección).
        if (to < 0 || to === from || (to < from && from - to > 1)) throw badRequest('Transición de estado inválida');
        const now = nowIso();
        const stamps = {
          preparando: 'started_at = COALESCE(started_at, @now)',
          listo: 'started_at = COALESCE(started_at, @now), ready_at = @now',
          entregado: 'ready_at = COALESCE(ready_at, @now), delivered_at = @now',
          pendiente: 'started_at = NULL, ready_at = NULL',
        };
        db.prepare(`UPDATE order_items SET status = @status, ${stamps[status]} WHERE id = @id`).run({ status, now, id: itemId });
      }
      eventBus.publish(Events.ITEM_UPDATED, { itemId, sessionId: item.session_id, status });
      eventBus.publish(Events.TABLES_CHANGED, { sessionId: item.session_id });
    });
  },

  /** Avanza todos los ítems de una comanda (ej. "Marchar todo al pase"). */
  setOrderStatus(user, orderId, status) {
    const db = getDb();
    const items = db.prepare("SELECT id, status FROM order_items WHERE order_id = ? AND status NOT IN ('anulado','entregado')").all(orderId);
    if (!items.length) throw notFound('La comanda no tiene ítems activos');
    const target = FLOW.indexOf(status);
    tx(() => {
      for (const it of items) if (FLOW.indexOf(it.status) < target) this.setItemStatus(user, it.id, status);
    });
  },

  /** Platos listos esperando ser retirados del pase. */
  readyToServe() {
    return boardRows("i.status = 'listo' AND s.status != 'closed'").map((r) => ({
      id: r.id, order_id: r.order_id, session_id: r.session_id, name: r.name, quantity: r.quantity, ready_at: r.ready_at,
      waiter_name: r.waiter_name, tables: floorRepository.tablesOfSession(r.session_id).map((t) => t.number),
    }));
  },
};
