import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { STATIONS } from '../menu/menu.constants.js';
import { ordersService, orderItemsSchema } from './orders.service.js';

export const ordersRouter = Router();
ordersRouter.use(authenticate);

ordersRouter.post(
  '/sessions/:sessionId',
  requirePermission('pedidos.crear'),
  validate(orderItemsSchema),
  (req, res) => {
    const orderId = ordersService.create({ sessionId: Number(req.params.sessionId), source: 'staff', user: req.user, ...req.body });
    res.status(201).json({ orderId });
  },
);

ordersRouter.get(
  '/kitchen',
  requirePermission('cocina.ver'),
  validate(z.object({ station: z.enum(STATIONS).optional() }), 'query'),
  (req, res) => res.json(ordersService.kitchenBoard(req.validQuery.station)),
);

ordersRouter.get('/ready', requirePermission('cocina.ver', 'salon.ver'), (_req, res) => res.json({ items: ordersService.readyToServe() }));

const statusSchema = z.object({
  status: z.enum(['pendiente', 'preparando', 'listo', 'entregado', 'anulado']),
  reason: z.string().trim().max(200).optional(),
});

ordersRouter.patch('/items/:id', requirePermission('cocina.operar', 'salon.operar', 'pedidos.crear'), validate(statusSchema), (req, res) => {
  const { status, reason } = req.body;
  // Mozos solo confirman entregas o anulan; cocina gestiona la preparación.
  if (['preparando', 'listo', 'pendiente'].includes(status) && !req.user.permissions.has('cocina.operar')) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Solo cocina puede cambiar estados de preparación' } });
  }
  ordersService.setItemStatus(req.user, Number(req.params.id), status, reason);
  res.status(204).end();
});

ordersRouter.patch(
  '/:id/status',
  requirePermission('cocina.operar'),
  validate(z.object({ status: z.enum(['preparando', 'listo']) })),
  (req, res) => {
    ordersService.setOrderStatus(req.user, Number(req.params.id), req.body.status);
    res.status(204).end();
  },
);
