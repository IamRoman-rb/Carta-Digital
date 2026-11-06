/** Formatos locales es-AR (ISO 4217 ARS). Montos de la API en centavos. */
const ars = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const arsCents = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
const time = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' });
const dateTime = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });

export const money = (cents) => ars.format(Math.round((cents ?? 0) / 100));
export const moneyExact = (cents) => arsCents.format((cents ?? 0) / 100);
/** Pesos (número o texto "1.234,50" / "1234.5") a centavos enteros. */
export function toCents(pesos) {
  if (typeof pesos === 'number') return Math.round(pesos * 100) || 0;
  const s = String(pesos ?? '').trim();
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Math.round(n * 100) || 0;
}
export const toPesos = (cents) => (cents ?? 0) / 100;
export const hhmm = (iso) => (iso ? time.format(new Date(iso)) : '');
export const dateTimeShort = (iso) => (iso ? dateTime.format(new Date(iso)) : '');

export function minutesSince(iso, now = Date.now()) {
  return iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000)) : 0;
}

export function elapsed(iso, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const pad = (n, len) => String(n).padStart(len, '0');

/** Fecha local AAAA-MM-DD. */
export function ymd(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
}

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
