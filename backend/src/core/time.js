/**
 * Utilidades de fecha con zona horaria del negocio (configurable en Ajustes).
 * Persistimos en UTC (ISO 8601) y calculamos rangos en hora local.
 */
import { settingsService } from '../modules/settings/settings.service.js';

const tz = () => settingsService.get('timezone');

/** Offset en minutos de la zona respecto de UTC para un instante. */
function offsetMinutes(date, timeZone) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName').value; // "GMT-03:00"
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** Partes locales (año, mes, día, hora, minuto, día de semana 0=domingo). */
export function localParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz(),
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour) % 24, minute: Number(parts.minute), weekday: weekdays[parts.weekday],
  };
}

/** Inicio del día local (YYYY-MM-DD) como Date UTC. */
export function startOfLocalDay(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  return new Date(guess.getTime() - offsetMinutes(guess, tz()) * 60_000);
}

export function todayYmd() {
  const p = localParts();
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Rango [from, to) en ISO UTC para días locales inclusive. */
export function rangeIso(fromYmd, toYmd) {
  const from = startOfLocalDay(fromYmd);
  const to = new Date(startOfLocalDay(toYmd).getTime() + 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export const localHourOf = (iso) => localParts(new Date(iso)).hour;
export const timezone = tz;
