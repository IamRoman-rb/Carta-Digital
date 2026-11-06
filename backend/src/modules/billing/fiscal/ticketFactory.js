/**
 * Fábrica de comprobantes (patrón Factory Method).
 * Arma el contenido del ticket según la normativa argentina:
 *  - RG 1415/2003 (ARCA): datos del emisor, receptor, letra, código, punto de venta y número.
 *  - Ley 27.743 (Régimen de Transparencia Fiscal al Consumidor): IVA contenido en comprobantes B.
 *  - RG 4291/2018: código QR (cuando el comprobante tiene CAE).
 *  - RG 5003/2021: Responsables Inscriptos emiten "A" a monotributistas.
 */
import { badRequest } from '../../../core/errors.js';
import { CBTE, DOC_TYPES, IVA_CONDITIONS, QR_BASE_URL, PAYMENT_METHODS, isValidCuit } from './fiscal.constants.js';

/** Determina la letra del comprobante según condición de emisor y receptor. */
export function resolveLetter(issuerCondition, receiverCondition) {
  if (issuerCondition !== 'responsable_inscripto') return 'C';
  return ['responsable_inscripto', 'monotributo'].includes(receiverCondition) ? 'A' : 'B';
}

/** Valida y normaliza los datos del receptor. */
export function normalizeReceiver(input, total, threshold) {
  const r = { iva_condition: 'consumidor_final', doc_type: DOC_TYPES.SIN_IDENTIFICAR, doc_number: '0', name: 'Consumidor Final', address: '', email: '', ...input };
  if (!r.doc_number) r.doc_number = '0';
  if (r.iva_condition !== 'consumidor_final') {
    if (!isValidCuit(r.doc_number)) throw badRequest('CUIT del receptor inválido');
    if (!r.name || r.name === 'Consumidor Final') throw badRequest('Indicá la razón social del receptor');
    r.doc_type = DOC_TYPES.CUIT;
  } else if (total >= threshold && (!r.doc_number || r.doc_number === '0')) {
    throw badRequest('Por el monto, el consumidor final debe identificarse con DNI, CUIT o CUIL');
  } else if (r.doc_number && r.doc_number !== '0') {
    r.doc_number = String(r.doc_number).replace(/\D/g, '');
    r.doc_type = r.doc_number.length === 11 ? DOC_TYPES.CUIL : DOC_TYPES.DNI;
  }
  return r;
}

const issuerOf = (s) => ({
  legal_name: s.business_legal_name,
  business_name: s.business_name,
  cuit: s.cuit,
  iibb: s.iibb,
  iva_condition: s.iva_condition,
  iva_condition_label: IVA_CONDITIONS[s.iva_condition],
  activity_start: s.activity_start,
  address: s.address,
  city: s.city,
  phone: s.phone,
});

function lines(bill, letter) {
  return bill.items.map((i) => {
    const base = {
      quantity: i.quantity,
      description: i.name,
      detail: i.modifiers.map((m) => m.name).join(', '),
      unit_price: i.unit_price,
      total: i.line_total,
      vat_rate: i.vat_rate,
    };
    // En "A" el precio unitario se expresa neto de IVA.
    if (letter === 'A') {
      base.unit_net = Math.round(i.unit_price / (1 + i.vat_rate / 100));
      base.total_net = Math.round(i.line_total / (1 + i.vat_rate / 100));
    }
    return base;
  });
}

function qrUrl({ issuedAt, cuit, pos, code, number, total, receiver, cae }) {
  const data = {
    ver: 1,
    fecha: issuedAt.slice(0, 10),
    cuit: Number(String(cuit).replace(/\D/g, '')),
    ptoVta: pos,
    tipoCmp: code,
    nroCmp: number,
    importe: total / 100,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: receiver.doc_type,
    nroDocRec: Number(receiver.doc_number) || 0,
    tipoCodAut: 'E',
    codAut: Number(cae),
  };
  return `${QR_BASE_URL}?p=${Buffer.from(JSON.stringify(data)).toString('base64')}`;
}

export const ticketFactory = {
  /** Pre-cuenta (no fiscal) para presentar en la mesa. */
  precuenta({ bill, settings, context, number }) {
    return {
      kind: 'precuenta',
      title: 'PRE-CUENTA',
      legend: 'DOCUMENTO NO VÁLIDO COMO FACTURA',
      letter: 'X',
      pos: settings.pos_number,
      number,
      issued_at: new Date().toISOString(),
      issuer: issuerOf(settings),
      lines: lines(bill, 'B'),
      totals: { subtotal: bill.subtotal, discount: bill.discount, discount_pct: bill.discountPct, total: bill.total, paid: bill.paid, balance: bill.balance },
      tip_options: settings.tip_options,
      context,
      currency: 'ARS',
      footer: settings.ticket_footer,
    };
  },

  /** Comprobante final de la cuenta. */
  comprobante({ bill, settings, context, receiver, authorization }) {
    const intendedLetter = resolveLetter(settings.iva_condition, receiver.iva_condition);
    const letter = authorization.fiscal ? intendedLetter : 'X';
    const issuedAt = new Date().toISOString();
    const isA = intendedLetter === 'A';
    const vatTotal = bill.vatTotal;
    return {
      kind: 'comprobante',
      fiscal: authorization.fiscal,
      title: authorization.fiscal ? CBTE[letter].title : 'COMPROBANTE INTERNO',
      legend: authorization.fiscal ? null : 'DOCUMENTO NO VÁLIDO COMO FACTURA',
      letter,
      code: authorization.fiscal ? CBTE[letter].code : null,
      intended: { letter: intendedLetter, code: CBTE[intendedLetter].code },
      pos: settings.pos_number,
      number: authorization.number,
      issued_at: issuedAt,
      issuer: issuerOf(settings),
      receiver: { ...receiver, iva_condition_label: IVA_CONDITIONS[receiver.iva_condition] },
      lines: lines(bill, intendedLetter),
      totals: {
        subtotal: bill.subtotal,
        discount: bill.discount,
        discount_pct: bill.discountPct,
        discount_reason: bill.discountReason,
        total: bill.total,
        net: isA ? bill.netTotal : null,
        vat_breakdown: isA ? bill.vatBreakdown : null,
      },
      // Ley 27.743: obligatorio en comprobantes a consumidores finales (clase B).
      transparency: intendedLetter === 'B' ? { vat_contained: vatTotal, other_national_indirect_taxes: 0 } : null,
      payments: bill.payments.map((p) => ({ method: PAYMENT_METHODS[p.method], amount: p.amount, tip: p.tip, received: p.received, change: p.change_given })),
      tips: bill.tips,
      cae: authorization.cae,
      cae_due: authorization.caeDue,
      qr_url: authorization.fiscal
        ? qrUrl({ issuedAt, cuit: settings.cuit, pos: settings.pos_number, code: CBTE[letter].code, number: authorization.number, total: bill.total, receiver, cae: authorization.cae })
        : null,
      context,
      currency: 'ARS',
      footer: settings.ticket_footer,
    };
  },
};
