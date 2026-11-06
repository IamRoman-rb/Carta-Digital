/**
 * Check-in de mesa (patrón Token/Capability).
 * El comensal solo puede pedir, llamar al mozo o pedir la cuenta después de escanear el QR
 * impreso en la mesa. El escaneo canjea el token del QR por un pase firmado (HS256) que:
 *  - caduca a las `table_checkin_hours` horas (ajuste configurable),
 *  - se invalida cuando la mesa se libera (cuenta cerrada, mesa liberada, separada o reubicada),
 *  - se invalida si se regenera el QR de la mesa.
 * La clave se deriva de JWT_SECRET con separación de dominio: un pase de mesa nunca sirve como
 * token del personal ni viceversa.
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError, notFound } from '../../core/errors.js';
import { sha256 } from '../../core/utils.js';
import { floorRepository } from '../floor/floor.repository.js';
import { settingsService } from '../settings/settings.service.js';

const AUDIENCE = 'mesa';
export const CHECKIN_HEADER = 'x-table-pass';
const key = crypto.createHmac('sha256', env.JWT_SECRET).update('table-checkin:v1').digest();
const qrFingerprint = (qrToken) => sha256(qrToken).slice(0, 16);

const checkinRequired = (msg) => new AppError(401, msg, 'CHECKIN_REQUIRED');

export const checkinService = {
  /** Canjea el token del QR impreso por un pase de mesa. */
  issue(qrToken) {
    const table = floorRepository.tableByToken(String(qrToken));
    if (!table) throw notFound('No reconocemos este código QR. Escaneá el de tu mesa.');
    const hours = settingsService.get('table_checkin_hours');
    const pass = jwt.sign({ tid: table.id, q: qrFingerprint(table.qr_token), at: Date.now() }, key, {
      algorithm: 'HS256',
      audience: AUDIENCE,
      expiresIn: Math.round(hours * 3600),
    });
    const { exp } = jwt.decode(pass);
    return { table, pass, expiresAt: new Date(exp * 1000).toISOString() };
  },

  /** Valida el pase y devuelve la mesa vigente. */
  verify(pass) {
    if (!pass) throw checkinRequired('Escaneá el código QR de tu mesa para continuar.');
    let claims;
    try {
      claims = jwt.verify(String(pass), key, { algorithms: ['HS256'], audience: AUDIENCE });
    } catch {
      throw checkinRequired('Tu ingreso a la mesa venció. Escaneá nuevamente el código QR.');
    }
    const table = floorRepository.tableById(claims.tid);
    if (!table || qrFingerprint(table.qr_token) !== claims.q) throw checkinRequired('El código de esta mesa cambió. Escaneá el QR nuevamente.');
    if (table.released_at && claims.at <= Date.parse(table.released_at)) {
      throw checkinRequired('La mesa fue liberada desde tu último escaneo. Escaneá el QR de tu mesa para pedir.');
    }
    return table;
  },
};

/** Middleware: exige un pase de mesa válido y deja la mesa en req.table. */
export function requireCheckin(req, _res, next) {
  req.table = checkinService.verify(req.get(CHECKIN_HEADER));
  next();
}
