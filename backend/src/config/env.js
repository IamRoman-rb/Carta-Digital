/**
 * Configuración centralizada y validada de variables de entorno.
 * Ningún secreto vive en el código: si falta una variable obligatoria
 * el proceso no arranca (fail-fast, ISO/IEC 27001 A.8.9 gestión de configuración).
 */
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive(),
  DB_PATH: z.string().min(1),
  UPLOAD_DIR: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  ACCESS_TOKEN_TTL: z.string().min(2),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive(),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15),
  CORS_ORIGINS: z.string().min(1),
  PUBLIC_APP_URL: z.url(),
  COOKIE_SECURE: bool,
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']),
  TRUST_PROXY: z.coerce.number().int().min(0),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive(),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive(),
  PUBLIC_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive(),
  MAX_UPLOAD_MB: z.coerce.number().positive(),
  FISCAL_PROVIDER: z.enum(['interno']),
  SERVE_FRONTEND_DIR: z.string().optional().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Configuración inválida. Revisá el archivo .env (ver .env.example):');
  for (const issue of parsed.error.issues) console.error(` - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

const e = parsed.data;
const resolve = (p) => (path.isAbsolute(p) ? p : path.join(rootDir, p));

export const env = Object.freeze({
  ...e,
  isProd: e.NODE_ENV === 'production',
  isTest: e.NODE_ENV === 'test',
  rootDir,
  dbPath: e.DB_PATH === ':memory:' ? ':memory:' : resolve(e.DB_PATH),
  uploadDir: resolve(e.UPLOAD_DIR),
  frontendDir: e.SERVE_FRONTEND_DIR ? resolve(e.SERVE_FRONTEND_DIR) : '',
  corsOrigins: e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
});
