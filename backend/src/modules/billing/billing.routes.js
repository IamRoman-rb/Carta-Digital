import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { billingService } from './billing.service.js';
import { cashService } from './cash.service.js';

export const billingRouter = Router();
billingRouter.use(authenticate);

const sid = (req) => Number(req.params.id);
const money = z.coerce.number().int().min(0).max(10_000_000_000);
const canCharge = requirePermission('caja.cobrar');

billingRouter.get('/cash', requirePermission('caja.ver'), (_req, res) => res.json({ cash: cashService.current(), history: cashService.history() }));
billingRouter.post('/cash/open', requirePermission('caja.abrir_cerrar'), validate(z.object({ openingAmount: money })), (req, res) => {
  res.status(201).json({ cash: cashService.open(req.user, req.body.openingAmount) });
});
billingRouter.post(
  '/cash/close',
  requirePermission('caja.abrir_cerrar'),
  validate(z.object({ countedCash: money, notes: z.string().trim().max(300).optional() })),
  (req, res) => res.json({ report: cashService.close(req.user, req.body.countedCash, req.body.notes) }),
);

billingRouter.get('/sessions/:id', requirePermission('caja.ver', 'salon.ver'), (req, res) => res.json({ bill: billingService.bill(sid(req)) }));

billingRouter.post(
  '/sessions/:id/quote',
  requirePermission('caja.ver'),
  validate(z.object({ mode: z.enum(['full', 'equal', 'items']), parts: z.coerce.number().int().min(2).max(60).optional(), itemIds: z.array(z.coerce.number().int().positive()).optional() })),
  (req, res) => res.json(billingService.quote(sid(req), req.body.mode, req.body)),
);

billingRouter.post(
  '/sessions/:id/discount',
  requirePermission('caja.descuentos'),
  validate(z.object({ percent: z.coerce.number().min(0).max(100), reason: z.string().trim().max(120).optional() })),
  (req, res) => res.json({ bill: billingService.applyDiscount(req.user, sid(req), req.body.percent, req.body.reason) }),
);

billingRouter.post(
  '/sessions/:id/payments',
  canCharge,
  validate(
    z.object({
      method: z.enum(['efectivo', 'debito', 'credito', 'qr', 'transferencia']),
      amount: money.refine((v) => v > 0, 'El importe debe ser mayor a 0'),
      tip: money.default(0),
      received: money.optional(),
      reference: z.string().trim().max(60).optional(),
    }),
  ),
  (req, res) => res.status(201).json(billingService.registerPayment(req.user, sid(req), req.body)),
);

billingRouter.post('/sessions/:id/precuenta', requirePermission('caja.ver', 'salon.operar'), (req, res) => {
  res.status(201).json({ ticket: billingService.precuenta(req.user, sid(req)) });
});

billingRouter.post(
  '/sessions/:id/close',
  canCharge,
  validate(
    z.object({
      receiver: z
        .object({
          iva_condition: z.enum(['consumidor_final', 'responsable_inscripto', 'monotributo', 'exento']),
          doc_number: z.string().trim().max(13).optional().default(''),
          name: z.string().trim().max(120).optional().default(''),
          address: z.string().trim().max(160).optional().default(''),
          email: z.union([z.email(), z.literal('')]).optional().default(''),
        })
        .default({ iva_condition: 'consumidor_final' }),
    }),
  ),
  (req, res) => {
    const r = req.body.receiver;
    const receiver = r.iva_condition === 'consumidor_final' && !r.name ? { ...r, name: undefined } : r;
    Object.keys(receiver).forEach((k) => receiver[k] === undefined && delete receiver[k]);
    res.status(201).json({ ticket: billingService.close(req.user, sid(req), receiver) });
  },
);

billingRouter.get('/tickets', requirePermission('caja.ver'), (_req, res) => res.json({ tickets: billingService.recentTickets() }));
billingRouter.get('/tickets/:id', requirePermission('caja.ver', 'salon.operar'), (req, res) => res.json({ ticket: billingService.ticket(sid(req)) }));
