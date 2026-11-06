import { env } from './config/env.js';
import { getDb, closeDb } from './db/connection.js';
import { createApp } from './app.js';
import { authService } from './modules/auth/auth.service.js';
import { seedSettings } from '../seed/seeder.js';

getDb();
// Completa ajustes nuevos con sus valores por defecto tras una actualización (no pisa los existentes).
seedSettings();
const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`API escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

const purge = setInterval(() => authService.purgeExpired(), 6 * 60 * 60 * 1000);

function shutdown(signal) {
  console.log(`${signal} recibido, cerrando…`);
  clearInterval(purge);
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
