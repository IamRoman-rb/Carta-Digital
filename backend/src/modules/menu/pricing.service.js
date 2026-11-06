/**
 * Motor de precios (patrón Strategy).
 * Cada estrategia de promoción decide si aplica a un producto en un instante dado.
 * Se aplica la de mayor descuento (no acumulables), redondeando a peso entero.
 */
import { getDb } from '../../db/connection.js';
import { parseJson } from '../../core/utils.js';
import { localParts } from '../../core/time.js';

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Ventana horaria; soporta franjas que cruzan medianoche (ej. 20:00 a 02:00). */
function inWindow(promo, parts) {
  const now = parts.hour * 60 + parts.minute;
  const start = toMinutes(promo.start_time);
  const end = toMinutes(promo.end_time);
  const days = promo.days;
  if (start <= end) return days.includes(parts.weekday) && now >= start && now <= end;
  // Cruza medianoche: la parte posterior a 00:00 pertenece al día anterior.
  const yesterday = (parts.weekday + 6) % 7;
  return (days.includes(parts.weekday) && now >= start) || (days.includes(yesterday) && now <= end);
}

const targetStrategies = {
  all: () => true,
  category: (promo, product) => promo.target_id === product.category_id,
  product: (promo, product) => promo.target_id === product.id,
};

export const pricingService = {
  activePromotions(at = new Date()) {
    const parts = localParts(at);
    return getDb()
      .prepare('SELECT * FROM promotions WHERE active = 1')
      .all()
      .map((p) => ({ ...p, days: parseJson(p.days, []) }))
      .filter((p) => inWindow(p, parts));
  },

  /** Precio final de un producto. promos se puede precalcular para listas grandes. */
  priceFor(product, promos = this.activePromotions()) {
    const best = promos
      .filter((p) => targetStrategies[p.target_type]?.(p, product))
      .sort((a, b) => b.percent - a.percent)[0];
    if (!best) return { price: product.price, finalPrice: product.price, promo: null };
    const discounted = Math.round((product.price * (100 - best.percent)) / 100 / 100) * 100;
    return { price: product.price, finalPrice: discounted, promo: { id: best.id, name: best.name, percent: best.percent } };
  },
};
