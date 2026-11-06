import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Entorno aislado: base en memoria y uploads temporales.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mesaar-test-'));
const ADMIN_PASSWORD = `Test${crypto.randomBytes(4).toString('hex')}1`;
Object.assign(process.env, {
  NODE_ENV: 'test', PORT: '4999', DB_PATH: ':memory:', UPLOAD_DIR: tmp, MAX_UPLOAD_MB: '5',
  JWT_SECRET: crypto.randomBytes(48).toString('hex'), ACCESS_TOKEN_TTL: '15m', REFRESH_TOKEN_TTL_DAYS: '1',
  BCRYPT_ROUNDS: '10', LOGIN_MAX_ATTEMPTS: '5', LOGIN_LOCK_MINUTES: '15', PUBLIC_RATE_LIMIT_PER_MIN: '1000',
  COOKIE_SECURE: 'false', COOKIE_SAMESITE: 'strict', TRUST_PROXY: '0', CORS_ORIGINS: 'http://localhost:5173',
  PUBLIC_APP_URL: 'http://localhost:5173', FISCAL_PROVIDER: 'interno',
  ADMIN_USERNAME: 'admin', ADMIN_NAME: 'Admin Test', ADMIN_PASSWORD,
});

const { default: request } = await import('supertest');
const { createApp } = await import('../src/app.js');
const { getDb, closeDb } = await import('../src/db/connection.js');
const seeder = await import('../seed/seeder.js');

const app = createApp();
let token;
let demoUsers;
const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
const NEW_PASSWORD = `Nueva${crypto.randomBytes(3).toString('hex')}9`;

before(async () => {
  console.log = () => {};
  console.table = () => {};
  getDb();
  seeder.seedRolesAndPermissions();
  seeder.seedSettings();
  await seeder.seedAdmin();
  demoUsers = await seeder.seedDemo();
});
after(() => {
  closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('login rechaza credenciales inválidas sin revelar si el usuario existe', async () => {
  const a = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'mala123' });
  const b = await request(app).post('/api/auth/login').send({ username: 'noexiste', password: 'mala123' });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.body.error.message, b.body.error.message);
});

test('contraseñas almacenadas con bcrypt', () => {
  const hash = getDb().prepare("SELECT password_hash FROM users WHERE username = 'admin'").pluck().get();
  assert.match(hash, /^\$2[aby]\$\d{2}\$/);
});

test('primer ingreso obliga a cambiar la contraseña', async () => {
  const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: ADMIN_PASSWORD });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.mustChangePassword, true);
  const blocked = await request(app).get('/api/floor').set(auth(res.body.accessToken));
  assert.equal(blocked.status, 403);
  const changed = await request(app).post('/api/auth/change-password').set(auth(res.body.accessToken)).send({ currentPassword: ADMIN_PASSWORD, newPassword: NEW_PASSWORD });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.user.mustChangePassword, false);
  token = changed.body.accessToken;
});

test('refresh token rota y detecta reutilización', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: NEW_PASSWORD }).expect(200);
  const first = await agent.post('/api/auth/refresh').expect(200);
  const oldCookie = first.headers['set-cookie'];
  assert.ok(first.body.accessToken);
  await agent.post('/api/auth/refresh').expect(200);
  const reuse = await request(app).post('/api/auth/refresh').set('Cookie', oldCookie);
  assert.equal(reuse.status, 401);
});

test('la carta pública no expone costos y trae modelos 3D', async () => {
  const res = await request(app).get('/api/public/menu').expect(200);
  assert.ok(res.body.products.length > 5);
  assert.ok(res.body.products.every((p) => !('cost' in p)));
  const picada = res.body.products.find((p) => p.name.includes('Picada'));
  assert.match(picada.model, /\.glb$/);
});

let session;
let tables;
test('unir mesas por drag & drop fusiona la cuenta', async () => {
  const state = await request(app).get('/api/floor').set(auth()).expect(200);
  tables = state.body.tables;
  const [t1, t2] = tables;
  const open = await request(app).post(`/api/floor/tables/${t1.id}/open`).set(auth()).send({ guests: 2 }).expect(201);
  session = open.body.sessionId;
  await request(app).post(`/api/orders/sessions/${session}`).set(auth()).send({ items: [{ product_id: 10, quantity: 2 }] }).expect(201);
  const other = await request(app).post(`/api/floor/tables/${t2.id}/open`).set(auth()).send({ guests: 3 }).expect(201);
  await request(app).post(`/api/orders/sessions/${other.body.sessionId}`).set(auth()).send({ items: [{ product_id: 11, quantity: 1 }] }).expect(201);
  const merged = await request(app).post('/api/floor/merge').set(auth()).send({ sourceTableId: t2.id, targetTableId: t1.id }).expect(200);
  assert.equal(merged.body.sessionId, session);
  const detail = await request(app).get(`/api/floor/sessions/${session}`).set(auth()).expect(200);
  assert.equal(detail.body.session.tables.length, 2);
  assert.equal(detail.body.session.guests, 5);
  assert.equal(detail.body.session.bill.items.length, 2);
});

test('pedido desde el QR valida modificadores obligatorios', async () => {
  const qr = getDb().prepare('SELECT qr_token FROM dining_tables WHERE id = ?').pluck().get(tables[1].id);
  const milanesa = getDb().prepare("SELECT id FROM products WHERE sku = 'MIL-01'").pluck().get();
  // Sin escanear el QR no se puede pedir.
  const noPass = await request(app).post('/api/public/table/orders').send({ items: [{ product_id: milanesa, quantity: 1 }] });
  assert.equal(noPass.status, 401);
  assert.equal(noPass.body.error.code, 'CHECKIN_REQUIRED');
  await request(app).post('/api/public/checkin').send({ qr: 'codigo-inexistente-123' }).expect(404);
  const checkin = await request(app).post('/api/public/checkin').send({ qr }).expect(201);
  assert.ok(checkin.body.pass && checkin.body.session);
  assert.equal(checkin.body.table.number, tables[1].number);
  const pass = { 'X-Table-Pass': checkin.body.pass };
  const bad = await request(app).post('/api/public/table/orders').set(pass).send({ items: [{ product_id: milanesa, quantity: 1 }] });
  assert.equal(bad.status, 400);
  const optionId = getDb().prepare("SELECT o.id FROM modifier_options o JOIN modifier_groups g ON g.id = o.group_id WHERE g.product_id = ? AND g.min_select = 1 LIMIT 1").pluck().get(milanesa);
  await request(app).post('/api/public/table/orders').set(pass).send({ items: [{ product_id: milanesa, quantity: 1, modifiers: [optionId] }] }).expect(201);
  await request(app).post('/api/public/table/calls').set(pass).send({ type: 'mozo' }).expect(201);
  const dup = await request(app).post('/api/public/table/calls').set(pass).send({ type: 'mozo' }).expect(200);
  assert.equal(dup.body.duplicated, true);
  const status = await request(app).get('/api/public/table/order').set(pass).expect(200);
  assert.ok(status.body.items.length >= 1);
});

test('el pase de mesa caduca al liberar la mesa o regenerar el QR', async () => {
  const t = tables[5];
  const qr = () => getDb().prepare('SELECT qr_token FROM dining_tables WHERE id = ?').pluck().get(t.id);
  const first = await request(app).post('/api/public/checkin').send({ qr: qr() }).expect(201);
  assert.equal(first.body.session, null, 'se puede escanear antes de que el mozo abra la mesa');
  const opened = await request(app).post(`/api/floor/tables/${t.id}/open`).set(auth()).send({ guests: 2 }).expect(201);
  await request(app).get('/api/public/table').set('X-Table-Pass', first.body.pass).expect(200);
  // El mozo libera la mesa: el pase anterior deja de servir (próximos comensales deben escanear).
  await request(app).delete(`/api/floor/sessions/${opened.body.sessionId}`).set(auth()).expect(204);
  const stale = await request(app).get('/api/public/table').set('X-Table-Pass', first.body.pass);
  assert.equal(stale.status, 401);
  const second = await request(app).post('/api/public/checkin').send({ qr: qr() }).expect(201);
  await request(app).get('/api/public/table').set('X-Table-Pass', second.body.pass).expect(200);
  await request(app).post(`/api/floor/tables/${t.id}/regenerate-qr`).set(auth()).expect(204);
  assert.equal((await request(app).get('/api/public/table').set('X-Table-Pass', second.body.pass)).status, 401);
  assert.equal((await request(app).get('/api/public/table').set('X-Table-Pass', 'basura')).status, 401);
});

test('cocina avanza estados y no se puede cerrar con platos en preparación', async () => {
  const board = await request(app).get('/api/orders/kitchen').set(auth()).expect(200);
  assert.ok(board.body.tickets.length >= 3);
  await request(app).post('/api/billing/cash/open').set(auth()).send({ openingAmount: 2000000 }).expect(201);
  const bill = (await request(app).get(`/api/billing/sessions/${session}`).set(auth())).body.bill;
  await request(app).post(`/api/billing/sessions/${session}/payments`).set(auth()).send({ method: 'debito', amount: bill.balance }).expect(201);
  const blocked = await request(app).post(`/api/billing/sessions/${session}/close`).set(auth()).send({});
  assert.equal(blocked.status, 409);
  for (const t of board.body.tickets) await request(app).patch(`/api/orders/${t.order_id}/status`).set(auth()).send({ status: 'listo' }).expect(204);
});

test('división en partes iguales y cierre con comprobante argentino', async () => {
  // Nueva mesa con cobro en efectivo y propina.
  const t = tables[3];
  const { body } = await request(app).post(`/api/floor/tables/${t.id}/open`).set(auth()).send({ guests: 2 }).expect(201);
  await request(app).post(`/api/orders/sessions/${body.sessionId}`).set(auth()).send({ items: [{ product_id: 3, quantity: 1 }] }).expect(201);
  const q = await request(app).post(`/api/billing/sessions/${body.sessionId}/quote`).set(auth()).send({ mode: 'equal', parts: 2 }).expect(200);
  assert.equal(q.body.amount, Math.ceil(q.body.total / 2 / 100) * 100);
  await request(app).post(`/api/billing/sessions/${body.sessionId}/payments`).set(auth()).send({ method: 'efectivo', amount: q.body.amount, tip: 50000, received: q.body.amount + 100000 }).expect(201);
  const rest = await request(app).post(`/api/billing/sessions/${body.sessionId}/payments`).set(auth()).send({ method: 'qr', amount: q.body.total - q.body.amount });
  assert.equal(rest.status, 201);
  const items = (await request(app).get(`/api/orders/kitchen`).set(auth())).body.tickets.filter((x) => x.session_id === body.sessionId);
  for (const k of items) await request(app).patch(`/api/orders/${k.order_id}/status`).set(auth()).send({ status: 'listo' }).expect(204);
  const closed = await request(app).post(`/api/billing/sessions/${body.sessionId}/close`).set(auth()).send({ receiver: { iva_condition: 'consumidor_final' } }).expect(201);
  const tk = closed.body.ticket;
  assert.equal(tk.letter, 'X');
  assert.equal(tk.legend, 'DOCUMENTO NO VÁLIDO COMO FACTURA');
  assert.equal(tk.intended.letter, 'B');
  assert.ok(tk.transparency.vat_contained > 0, 'Ley 27.743: IVA contenido');
  assert.equal(tk.payments[0].change, 50000);
  assert.throws(() => getDb().prepare('UPDATE tickets SET total = 0 WHERE id = ?').run(tk.id), /inmutables/);
});

test('factura a responsable inscripto valida CUIT', async () => {
  const bill = (await request(app).get(`/api/billing/sessions/${session}`).set(auth())).body.bill;
  assert.equal(bill.balance, 0);
  const bad = await request(app).post(`/api/billing/sessions/${session}/close`).set(auth()).send({ receiver: { iva_condition: 'responsable_inscripto', doc_number: '20-12345678-0', name: 'ACME SA' } });
  assert.equal(bad.status, 400);
  const ok = await request(app).post(`/api/billing/sessions/${session}/close`).set(auth()).send({ receiver: { iva_condition: 'responsable_inscripto', doc_number: '20-12345678-6', name: 'ACME SA' } }).expect(201);
  assert.equal(ok.body.ticket.intended.letter, 'A');
  assert.ok(ok.body.ticket.totals.vat_breakdown.length > 0);
  const state = await request(app).get('/api/floor').set(auth()).expect(200);
  assert.equal(state.body.tables.find((x) => x.id === tables[0].id).session_id, null, 'la mesa queda libre');
});

test('informes reflejan lo cobrado y RBAC bloquea a un mozo', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
  const rep = await request(app).get(`/api/reports/summary?from=${today}&to=${today}`).set(auth()).expect(200);
  assert.equal(rep.body.kpis.tickets, 2);
  assert.ok(rep.body.kpis.revenue > 0);
  assert.ok(rep.body.products.every((p) => ['estrella', 'caballo', 'puzzle', 'perro'].includes(p.quadrant)));
  const mozo = demoUsers.find((u) => u.rol === 'mozo');
  const login = await request(app).post('/api/auth/login').send({ username: mozo.usuario, password: mozo['contraseña temporal'] }).expect(200);
  const ch = await request(app).post('/api/auth/change-password').set(auth(login.body.accessToken)).send({ currentPassword: mozo['contraseña temporal'], newPassword: NEW_PASSWORD }).expect(200);
  await request(app).get('/api/reports/summary?from=2026-01-01&to=2026-01-02').set(auth(ch.body.accessToken)).expect(403);
  await request(app).get('/api/floor').set(auth(ch.body.accessToken)).expect(200);
});
