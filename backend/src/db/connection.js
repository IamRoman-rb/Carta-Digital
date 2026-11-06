/**
 * Conexión SQLite3 (patrón Singleton) + ejecutor de migraciones versionadas.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { env } from '../config/env.js';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

let instance = null;

export function getDb() {
  if (instance) return instance;
  if (env.dbPath !== ':memory:') fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });
  instance = new Database(env.dbPath);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  instance.pragma('busy_timeout = 5000');
  instance.pragma('synchronous = NORMAL');
  migrate(instance);
  return instance;
}

export function closeDb() {
  instance?.close();
  instance = null;
}

function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(db.prepare('SELECT name FROM schema_migrations').pluck().all());
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
    })();
  }
}

/** Ejecuta fn dentro de una transacción atómica. */
export const tx = (fn) => getDb().transaction(fn)();
