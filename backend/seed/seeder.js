/** Funciones de inicialización de datos (reutilizadas por el CLI y los tests). */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getDb } from '../src/db/connection.js';
import { PERMISSIONS, DEFAULT_ROLES } from '../src/modules/users/permissions.catalog.js';
import { usersRepository } from '../src/modules/users/users.repository.js';
import { rolesRepository } from '../src/modules/users/roles.repository.js';
import { settingsService } from '../src/modules/settings/settings.service.js';
import { hashPassword, passwordSchema } from '../src/modules/auth/password.js';
import { menuRepository } from '../src/modules/menu/menu.repository.js';
import { productSchema } from '../src/modules/menu/menu.service.js';
import { mediaService } from '../src/modules/uploads/media.service.js';
import { randomToken } from '../src/core/utils.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(here, f), 'utf8'));
const db = () => getDb();

export function seedRolesAndPermissions() {
  const insP = db().prepare('INSERT INTO permissions (code, grp, description) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET grp = excluded.grp, description = excluded.description');
  PERMISSIONS.forEach((p) => insP.run(p.code, p.grp, p.description));
  for (const role of DEFAULT_ROLES) {
    let existing = rolesRepository.findByCode(role.code);
    if (!existing) {
      db().prepare('INSERT INTO roles (code, name, is_system) VALUES (?, ?, ?)').run(role.code, role.name, role.isSystem ? 1 : 0);
      existing = rolesRepository.findByCode(role.code);
      role.permissions.forEach((c) => rolesRepository.setPermission(existing.id, c, true));
    } else if (role.isSystem) {
      role.permissions.forEach((c) => rolesRepository.setPermission(existing.id, c, true));
    }
  }
  console.log('✔ Roles y permisos');
}

export async function seedAdmin() {
  const { ADMIN_USERNAME: username, ADMIN_NAME: name, ADMIN_PASSWORD: password } = process.env;
  if (usersRepository.countActiveAdmins() > 0) return console.log('✔ Administrador existente (sin cambios)');
  if (!username || !name || !password) {
    const missing = ['ADMIN_USERNAME', 'ADMIN_NAME', 'ADMIN_PASSWORD'].filter((k) => !process.env[k]);
    console.error(`✖ Faltan ${missing.join(', ')} para crear el primer administrador.`);
    console.error('  Definilas en backend/.env (local) o en las variables de entorno del hosting (Render: servicio → Environment).');
    process.exit(1);
  }
  const check = passwordSchema.safeParse(password);
  if (!check.success) {
    console.error(`✖ ADMIN_PASSWORD no cumple la política: ${check.error.issues.map((i) => i.message).join(', ')}`);
    process.exit(1);
  }
  usersRepository.create({ name, username, passwordHash: await hashPassword(password), roleId: rolesRepository.findByCode('admin').id, mustChangePassword: true });
  console.log(`✔ Administrador "${username}" creado (deberá cambiar la contraseña al ingresar)`);
}

const strongPassword = () => `${crypto.randomBytes(6).toString('base64url')}${crypto.randomInt(10, 99)}`;

export async function seedDemo() {
  const data = readJson('demo-data.json');
  const sectorIds = new Map();
  data.sectors.forEach((s, i) => {
    db().prepare('INSERT OR IGNORE INTO sectors (name, sort_order) VALUES (?, ?)').run(s.name, i);
    const sid = db().prepare('SELECT id FROM sectors WHERE name = ?').pluck().get(s.name);
    sectorIds.set(s.name, sid);
    for (const t of s.tables) {
      db().prepare('INSERT OR IGNORE INTO dining_tables (sector_id, number, seats, shape, pos_x, pos_y, qr_token) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(sid, t.number, t.seats, t.shape, t.pos_x, t.pos_y, randomToken(18));
    }
  });
  console.log('✔ Sectores y mesas');

  const catIds = new Map();
  data.categories.forEach((c, i) => {
    db().prepare('INSERT OR IGNORE INTO categories (name, icon, sort_order) VALUES (?, ?, ?)').run(c.name, c.icon, i);
    catIds.set(c.name, db().prepare('SELECT id FROM categories WHERE name = ?').pluck().get(c.name));
  });

  const bySku = new Map();
  const vat = settingsService.get('default_vat_rate');
  for (const [i, p] of data.products.entries()) {
    const existing = db().prepare('SELECT id FROM products WHERE sku = ?').pluck().get(p.sku);
    if (existing) {
      bySku.set(p.sku, existing);
      continue;
    }
    const combo_items = (p.combo ?? []).map((c) => ({ product_id: bySku.get(c.sku), quantity: c.quantity }));
    const parsed = productSchema.parse({ ...p, category_id: catIds.get(p.category), vat_rate: vat, sort_order: i, combo_items });
    const id = menuRepository.saveProduct(null, parsed);
    bySku.set(p.sku, id);
    if (p.image) {
      const buf = fs.readFileSync(path.join(here, 'assets', p.image));
      const imagePath = await mediaService.saveProductImage(id, buf, 'image/jpeg');
      menuRepository.setMedia(id, { image_path: imagePath });
      const model = mediaService.generatePlateModel(menuRepository.findProduct(id));
      if (model) menuRepository.setMedia(id, { model_path: model, model_auto: 1 });
    }
  }
  console.log('✔ Carta (categorías, platos, imágenes y modelos 3D automáticos)');

  for (const pr of data.promotions) {
    if (db().prepare('SELECT 1 FROM promotions WHERE name = ?').get(pr.name)) continue;
    menuRepository.savePromotion(null, { ...pr, target_id: catIds.get(pr.target) ?? bySku.get(pr.target) ?? null, active: true });
  }
  console.log('✔ Promociones');

  const created = [];
  for (const u of data.users) {
    if (usersRepository.findByUsername(u.username)) continue;
    const password = strongPassword();
    usersRepository.create({
      name: u.name,
      username: u.username,
      passwordHash: await hashPassword(password),
      roleId: rolesRepository.findByCode(u.role).id,
      sectorId: sectorIds.get(u.sector) ?? null,
      mustChangePassword: true,
    });
    created.push({ usuario: u.username, rol: u.role, 'contraseña temporal': password });
  }
  if (created.length) {
    console.log('✔ Usuarios demo creados. Guardá estas contraseñas temporales (se muestran una sola vez):');
    console.table(created);
  }
  return created;
}

export function seedSettings() {
  settingsService.ensureDefaults(readJson('settings.json'));
  console.log('✔ Ajustes iniciales');
}
