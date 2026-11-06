/**
 * Ajustes del negocio almacenados en la base (clave/valor JSON).
 * El esquema define tipos; los valores iniciales los carga el seed y se editan desde "Ajustes POS".
 */
import { z } from 'zod';
import { getDb } from '../../db/connection.js';
import { badRequest } from '../../core/errors.js';

const cuit = z.string().regex(/^\d{2}-?\d{8}-?\d$/, 'CUIT inválido (formato 20-12345678-9)');

export const settingsSchema = z.object({
  business_name: z.string().trim().min(1).max(80),
  business_legal_name: z.string().trim().min(1).max(120),
  cuit,
  iibb: z.string().trim().max(30),
  iva_condition: z.enum(['responsable_inscripto', 'monotributo', 'exento']),
  activity_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  address: z.string().trim().min(1).max(160),
  city: z.string().trim().max(80),
  phone: z.string().trim().max(40),
  email: z.union([z.email(), z.literal('')]),
  pos_number: z.coerce.number().int().min(1).max(99999),
  default_vat_rate: z.coerce.number().refine((v) => [0, 2.5, 5, 10.5, 21, 27].includes(v), 'Alícuota de IVA inválida'),
  tip_options: z.array(z.coerce.number().min(0).max(100)).min(1).max(6),
  suggested_tip: z.coerce.number().min(0).max(100),
  timezone: z.string().refine((v) => {
    try { new Intl.DateTimeFormat('es-AR', { timeZone: v }); return true; } catch { return false; }
  }, 'Zona horaria inválida'),
  cf_id_threshold: z.coerce.number().int().min(0),
  kds_warn_minutes: z.coerce.number().int().min(1).max(120),
  kds_late_minutes: z.coerce.number().int().min(2).max(240),
  customer_ordering_enabled: z.boolean(),
  table_checkin_hours: z.coerce.number().min(0.5).max(24),
  welcome_message: z.string().trim().max(160),
  ticket_footer: z.string().trim().max(200),
});

export const PUBLIC_KEYS = ['business_name', 'tip_options', 'suggested_tip', 'customer_ordering_enabled', 'welcome_message', 'address', 'phone'];

let cache = null;

function load() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  cache = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  return cache;
}

export const settingsService = {
  all() {
    return cache ?? load();
  },
  get(key) {
    const value = this.all()[key];
    if (value === undefined) throw new Error(`Falta el ajuste "${key}". Ejecutá "npm run db:seed".`);
    return value;
  },
  publicView() {
    const all = this.all();
    return Object.fromEntries(PUBLIC_KEYS.map((k) => [k, all[k]]));
  },
  update(partial) {
    const parsed = settingsSchema.partial().safeParse(partial);
    if (!parsed.success) {
      throw badRequest('Ajustes inválidos', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const merged = { ...this.all(), ...parsed.data };
    if (merged.kds_late_minutes <= merged.kds_warn_minutes) throw badRequest('El umbral de demora debe ser mayor al de advertencia');
    const db = getDb();
    const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    db.transaction(() => {
      for (const [k, v] of Object.entries(parsed.data)) stmt.run(k, JSON.stringify(v));
    })();
    cache = null;
    return this.all();
  },
  /** Solo para el seed: inserta claves faltantes sin pisar las existentes. */
  ensureDefaults(defaults) {
    const parsed = settingsSchema.parse(defaults);
    const stmt = getDb().prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(parsed)) stmt.run(k, JSON.stringify(v));
    cache = null;
  },
};
