import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { floorService } from './floor.service.js';

export const floorRouter = Router();
floorRouter.use(authenticate);

const id = (req) => Number(req.params.id);
const operate = requirePermission('salon.operar');
const editPlan = requirePermission('salon.editar_plano');
const pos = z.coerce.number().min(0).max(100);
const tableSchema = z.object({
  sector_id: z.coerce.number().int().positive(),
  number: z.coerce.number().int().min(1).max(9999),
  label: z.string().trim().max(30).optional().default(''),
  seats: z.coerce.number().int().min(1).max(40),
  shape: z.enum(['round', 'square', 'rect']),
  pos_x: pos.default(10),
  pos_y: pos.default(10),
});

floorRouter.get('/', requirePermission('salon.ver', 'caja.ver', 'pedidos.crear'), (_req, res) => res.json(floorService.state()));
floorRouter.get('/sessions/:id', requirePermission('salon.ver', 'caja.ver'), (req, res) => res.json({ session: floorService.sessionDetail(id(req)) }));

floorRouter.post(
  '/tables/:id/open',
  requirePermission('salon.operar', 'pedidos.crear'),
  validate(z.object({ guests: z.coerce.number().int().min(1).max(60), waiterId: z.coerce.number().int().positive().nullable().optional() })),
  (req, res) => res.status(201).json({ sessionId: floorService.openTable(req.user, id(req), req.body) }),
);

floorRouter.post(
  '/merge',
  operate,
  validate(z.object({ sourceTableId: z.coerce.number().int().positive(), targetTableId: z.coerce.number().int().positive() })),
  (req, res) => res.json({ sessionId: floorService.mergeTables(req.user, req.body.sourceTableId, req.body.targetTableId) }),
);

floorRouter.post('/tables/:id/separate', operate, (req, res) => {
  floorService.separateTable(req.user, id(req));
  res.status(204).end();
});

floorRouter.post('/tables/:id/move', operate, validate(z.object({ toTableId: z.coerce.number().int().positive() })), (req, res) => {
  floorService.moveSession(req.user, id(req), req.body.toTableId);
  res.status(204).end();
});

floorRouter.patch(
  '/sessions/:id',
  operate,
  validate(z.object({ guests: z.coerce.number().int().min(1).max(60).optional(), waiterId: z.coerce.number().int().positive().nullable().optional() })),
  (req, res) => {
    floorService.updateSession(req.user, id(req), req.body);
    res.status(204).end();
  },
);

floorRouter.delete('/sessions/:id', operate, (req, res) => {
  floorService.cancelSession(req.user, id(req));
  res.status(204).end();
});

floorRouter.post('/calls/:id/attend', requirePermission('salon.ver', 'caja.ver'), (req, res) => {
  floorService.attendCall(req.user, id(req));
  res.status(204).end();
});

// ---- Edición del plano y sectores ----
const sectorSchema = z.object({ name: z.string().trim().min(2).max(40), sort_order: z.coerce.number().int().min(0).default(0), active: z.boolean().default(true) });
floorRouter.post('/sectors', editPlan, validate(sectorSchema), (req, res) => res.status(201).json({ id: floorService.saveSector(req.user, null, req.body) }));
floorRouter.put('/sectors/:id', editPlan, validate(sectorSchema), (req, res) => res.json({ id: floorService.saveSector(req.user, id(req), req.body) }));
floorRouter.delete('/sectors/:id', editPlan, (req, res) => {
  floorService.deleteSector(req.user, id(req));
  res.status(204).end();
});

floorRouter.post('/tables', editPlan, validate(tableSchema), (req, res) => res.status(201).json({ id: floorService.createTable(req.user, req.body) }));
floorRouter.put('/tables/:id', editPlan, validate(tableSchema.omit({ pos_x: true, pos_y: true })), (req, res) => {
  floorService.updateTable(req.user, id(req), req.body);
  res.status(204).end();
});
floorRouter.put(
  '/positions',
  editPlan,
  validate(z.object({ positions: z.array(z.object({ id: z.coerce.number().int().positive(), pos_x: pos, pos_y: pos })).min(1).max(500) })),
  (req, res) => {
    floorService.savePositions(req.user, req.body.positions);
    res.status(204).end();
  },
);
floorRouter.delete('/tables/:id', editPlan, (req, res) => {
  floorService.deleteTable(req.user, id(req));
  res.status(204).end();
});
floorRouter.post('/tables/:id/regenerate-qr', editPlan, (req, res) => {
  floorService.regenerateQr(req.user, id(req));
  res.status(204).end();
});
