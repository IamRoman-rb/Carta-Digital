/**
 * Inicialización de la base.
 *   npm run db:seed        -> roles, permisos, ajustes iniciales y usuario administrador (desde .env)
 *   npm run db:seed:demo   -> además: sectores, mesas, carta, promociones y usuarios de demostración
 *
 * Las contraseñas nunca se escriben en el código: el admin se toma de variables de entorno
 * (ADMIN_USERNAME, ADMIN_NAME, ADMIN_PASSWORD) y los usuarios demo reciben contraseñas
 * aleatorias que se muestran una única vez y deben cambiarse en el primer ingreso.
 */
import { closeDb } from '../src/db/connection.js';
import { seedRolesAndPermissions, seedSettings, seedAdmin, seedDemo } from './seeder.js';

try {
  seedRolesAndPermissions();
  seedSettings();
  await seedAdmin();
  if (process.argv.includes('--demo')) await seedDemo();
} finally {
  closeDb();
}
