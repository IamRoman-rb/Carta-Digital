/**
 * Proveedores de autorización fiscal (patrón Strategy / Adapter).
 *
 * - "interno": numeración interna, sin CAE. El comprobante se imprime como
 *   "DOCUMENTO NO VÁLIDO COMO FACTURA" (letra X), indicando el comprobante fiscal
 *   que corresponde emitir. Es el comportamiento seguro por defecto: nunca se
 *   simula un CAE.
 *
 * Para emitir factura electrónica válida se agrega un adaptador "arca" que
 * implemente authorize() contra WSAA + WSFEv1 con el certificado del contribuyente
 * y se registra en `providers`. El resto del sistema no cambia.
 */
import { getDb } from '../../../db/connection.js';

function nextNumber(kind, letter, pos) {
  const last = getDb()
    .prepare('SELECT MAX(number) FROM tickets WHERE kind = ? AND letter = ? AND pos_number = ?')
    .pluck()
    .get(kind, letter, pos);
  return (last ?? 0) + 1;
}

class InternalFiscalProvider {
  name = 'interno';

  /** @returns {{ fiscal: boolean, letter: string, code: number|null, number: number, cae: string|null, caeDue: string|null }} */
  authorize({ kind, intended, pos }) {
    const letter = 'X';
    return { fiscal: false, letter, code: null, number: nextNumber(kind, letter, pos), cae: null, caeDue: null, intended };
  }
}

const providers = { interno: new InternalFiscalProvider() };

export function fiscalProvider(name = 'interno') {
  const p = providers[name];
  if (!p) throw new Error(`Proveedor fiscal desconocido: ${name}`);
  return p;
}

export { nextNumber };
