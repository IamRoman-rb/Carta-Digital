/**
 * Constantes normativas de comprobantes (ARCA, ex AFIP).
 * - Códigos de comprobante: Tabla de Comprobantes WSFEv1.
 * - Tipos de documento: Tabla de Tipos de Documento.
 * - QR: RG 4291/2018 (especificación "QR de comprobantes electrónicos").
 */
export const CBTE = Object.freeze({
  A: { code: 1, title: 'FACTURA' },
  B: { code: 6, title: 'FACTURA' },
  C: { code: 11, title: 'FACTURA' },
});

export const DOC_TYPES = Object.freeze({ CUIT: 80, CUIL: 86, DNI: 96, SIN_IDENTIFICAR: 99 });

export const IVA_CONDITIONS = Object.freeze({
  responsable_inscripto: 'IVA Responsable Inscripto',
  monotributo: 'Responsable Monotributo',
  exento: 'IVA Sujeto Exento',
  consumidor_final: 'Consumidor Final',
});

export const QR_BASE_URL = 'https://www.afip.gob.ar/fe/qr/';

export const PAYMENT_METHODS = Object.freeze({
  efectivo: 'Efectivo',
  debito: 'Tarjeta de débito',
  credito: 'Tarjeta de crédito',
  qr: 'QR / Billetera virtual',
  transferencia: 'Transferencia bancaria',
});

/** Valida un CUIT/CUIL con su dígito verificador (módulo 11). */
export function isValidCuit(value) {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 11) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((s, w, i) => s + w * Number(digits[i]), 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) check = 9;
  return check === Number(digits[10]);
}
