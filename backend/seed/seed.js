/**
 * Inicialización de la base.
 *   npm run db:seed        -> roles, permisos, ajustes iniciales y usuario administrador (desde .env)
 *   npm run db:seed:demo   -> además: sectores, mesas, carta, promociones y usuarios de demostración
 *   node seed/seed.js --demo-if-empty -> carga la demo solo si todavía no hay mesas (despliegues automáticos)
 *
 * Las contraseñas nunca se escriben en el código: el admin se toma de variables de entorno
 * (ADMIN_USERNAME, ADMIN_NAME, ADMIN_PASSWORD) y los usuarios demo reciben contraseñas
 * aleatorias que se muestran una única vez y deben cambiarse en el primer ingreso.
 */
import { closeDb, getDb } from '../src/db/connection.js';
import { seedRolesAndPermissions, seedSettings, seedAdmin, seedDemo } from './seeder.js';

try {
  seedRolesAndPermissions();
  seedSettings();
  await seedAdmin();
  const empty = () => getDb().prepare('SELECT COUNT(*) FROM dining_tables').pluck().get() === 0;
  if (process.argv.includes('--demo')) await seedDemo();
  else if (process.argv.includes('--demo-if-empty')) {
    if (empty()) await seedDemo();
    else console.log('✔ Ya hay datos: se omite la demo');
  }
} finally {
  closeDb();
}
