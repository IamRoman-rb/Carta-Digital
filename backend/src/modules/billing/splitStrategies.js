/**
 * Estrategias de división de cuenta (patrón Strategy).
 * Cada una devuelve el importe sugerido a cobrar en el próximo pago.
 */
import { badRequest } from '../../core/errors.js';

export const splitStrategies = {
  /** Cuenta única: saldo completo. */
  full: (bill) => bill.balance,

  /** Partes iguales: total / n, redondeado hacia arriba al peso, sin exceder el saldo. */
  equal: (bill, { parts }) => {
    if (!parts || parts < 2) throw badRequest('Indicá entre cuántas personas dividir');
    const share = Math.ceil(bill.total / parts / 100) * 100;
    return Math.min(share, bill.balance);
  },

  /** Ítem por ítem: suma de los ítems seleccionados (con descuento prorrateado). */
  items: (bill, { itemIds }) => {
    if (!itemIds?.length) throw badRequest('Seleccioná al menos un ítem');
    const selected = bill.items.filter((i) => itemIds.includes(i.id));
    if (selected.length !== itemIds.length) throw badRequest('Hay ítems que no pertenecen a esta cuenta');
    const factor = bill.subtotal ? bill.total / bill.subtotal : 1;
    return Math.min(Math.round(selected.reduce((s, i) => s + i.line_total, 0) * factor), bill.balance);
  },
};

export function quote(bill, mode, options = {}) {
  const strategy = splitStrategies[mode];
  if (!strategy) throw badRequest('Modo de división inválido');
  return strategy(bill, options);
}
