import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db/connection.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound, forbidden } from '../../core/errors.js';
import { audit, parseJson } from '../../core/utils.js';
import { rangeIso, todayYmd } from '../../core/time.js';
import { hashPassword, passwordSchema } from '../auth/password.js';
import { usersRepository } from './users.repository.js';
import { rolesRepository } from './roles.repository.js';
import { PERMISSIONS } from './permissions.catalog.js';

export const usersRouter = Router();
usersRouter.use(authenticate);

const userBody = z.object({
  name: z.string().trim().min(2).max(80),
  username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/, 'Solo letras, números, punto, guion y guion bajo'),
  password: passwordSchema,
  roleId: z.coerce.number().int().positive(),
  sectorId: z.coerce.number().int().positive().nullable().optional(),
});

usersRouter.get('/', requirePermission('equipo.ver'), (_req, res) => {
  const { from, to } = rangeIso(todayYmd(), todayYmd());
  const stats = getDb()
    .prepare(
      `SELECT s.waiter_id AS user_id, COUNT(DISTINCT s.id) AS tables_today,
              SUM(CASE WHEN s.status != 'closed' THEN 1 ELSE 0 END) AS open_tables,
              COALESCE((SELECT SUM(p.amount) FROM payments p JOIN table_sessions s2 ON s2.id = p.session_id
                        WHERE s2.waiter_id = s.waiter_id AND p.created_at >= ? AND p.created_at < ?), 0) AS sales_today,
              COALESCE((SELECT SUM(p.tip) FROM payments p JOIN table_sessions s2 ON s2.id = p.session_id
                        WHERE s2.waiter_id = s.waiter_id AND p.created_at >= ? AND p.created_at < ?), 0) AS tips_today
       FROM table_sessions s
       WHERE s.waiter_id IS NOT NULL AND (s.opened_at >= ? OR s.status != 'closed')
       GROUP BY s.waiter_id`,
    )
    .all(from, to, from, to, from);
  const byUser = new Map(stats.map((s) => [s.user_id, s]));
  res.json({
    users: usersRepository.list().map((u) => ({
      ...u,
      stats: byUser.get(u.id) ?? { tables_today: 0, open_tables: 0, sales_today: 0, tips_today: 0 },
    })),
  });
});

usersRouter.get('/roles', requirePermission('equipo.ver', 'salon.operar'), (_req, res) => {
  res.json({ roles: rolesRepository.list(), permissions: PERMISSIONS });
});

/** Lista mínima de mozos activos (para asignación de mesas). */
usersRouter.get('/waiters', requirePermission('salon.ver'), (_req, res) => {
  res.json({
    waiters: getDb()
      .prepare(`SELECT u.id, u.name FROM users u JOIN roles r ON r.id = u.role_id
                WHERE u.active = 1 AND r.code IN ('mozo','encargado','admin') ORDER BY u.name`)
      .all(),
  });
});

usersRouter.post('/', requirePermission('equipo.editar'), validate(userBody), async (req, res) => {
  const { name, username, password, roleId, sectorId } = req.body;
  const role = rolesRepository.findById(roleId);
  if (!role) throw badRequest('Rol inexistente');
  if (role.code === 'admin' && !req.user.permissions.has('equipo.permisos')) throw forbidden('Solo un administrador puede crear administradores');
  const id = usersRepository.create({ name, username, passwordHash: await hashPassword(password), roleId, sectorId });
  audit(req.user.id, 'crear_usuario', 'user', id, { username, role: role.code });
  res.status(201).json({ user: usersRepository.publicView(usersRepository.findById(id)) });
});

usersRouter.put(
  '/:id',
  requirePermission('equipo.editar'),
  validate(userBody.omit({ password: true, username: true }).extend({ active: z.boolean() })),
  (req, res) => {
    const id = Number(req.params.id);
    const current = usersRepository.findById(id);
    if (!current) throw notFound('Usuario inexistente');
    const role = rolesRepository.findById(req.body.roleId);
    if (!role) throw badRequest('Rol inexistente');
    const losesAdmin = current.role_code === 'admin' && current.active && (role.code !== 'admin' || !req.body.active);
    if (losesAdmin && usersRepository.countActiveAdmins() <= 1) throw badRequest('Debe quedar al menos un administrador activo');
    if (id === req.user.id && !req.body.active) throw badRequest('No podés desactivar tu propio usuario');
    usersRepository.update(id, req.body);
    audit(req.user.id, 'editar_usuario', 'user', id, req.body);
    res.json({ user: usersRepository.publicView(usersRepository.findById(id)) });
  },
);

usersRouter.post(
  '/:id/reset-password',
  requirePermission('equipo.editar'),
  validate(z.object({ password: passwordSchema })),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!usersRepository.findById(id)) throw notFound('Usuario inexistente');
    usersRepository.setPassword(id, await hashPassword(req.body.password), true);
    getDb().prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(new Date().toISOString(), id);
    audit(req.user.id, 'reset_password', 'user', id);
    res.status(204).end();
  },
);

usersRouter.put(
  '/roles/:roleId/permissions',
  requirePermission('equipo.permisos'),
  validate(z.object({ code: z.string(), enabled: z.boolean() })),
  (req, res) => {
    const role = rolesRepository.findById(Number(req.params.roleId));
    if (!role) throw notFound('Rol inexistente');
    if (role.is_system) throw badRequest('El rol administrador tiene todos los permisos y no se puede modificar');
    if (!PERMISSIONS.some((p) => p.code === req.body.code)) throw badRequest('Permiso inexistente');
    rolesRepository.setPermission(role.id, req.body.code, req.body.enabled);
    audit(req.user.id, req.body.enabled ? 'otorgar_permiso' : 'revocar_permiso', 'role', role.id, { code: req.body.code });
    res.json({ roles: rolesRepository.list() });
  },
);

usersRouter.get('/audit', requirePermission('equipo.permisos'), (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = getDb()
    .prepare(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.detail, a.created_at, u.name AS user_name
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ?`,
    )
    .all(limit);
  res.json({ entries: rows.map((r) => ({ ...r, detail: parseJson(r.detail, null) })) });
});
