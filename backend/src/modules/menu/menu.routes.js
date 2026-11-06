import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { upload } from '../uploads/media.service.js';
import { menuService, categorySchema, productSchema, promotionSchema } from './menu.service.js';

export const menuRouter = Router();
menuRouter.use(authenticate);

const id = (req) => Number(req.params.id);
const canEdit = requirePermission('carta.editar');

menuRouter.get('/', requirePermission('carta.ver', 'pedidos.crear'), (_req, res) => res.json(menuService.adminCatalog()));

menuRouter.post('/categories', canEdit, validate(categorySchema), (req, res) => {
  res.status(201).json({ id: menuService.saveCategory(req.user, null, req.body) });
});
menuRouter.put('/categories/:id', canEdit, validate(categorySchema), (req, res) => {
  res.json({ id: menuService.saveCategory(req.user, id(req), req.body) });
});
menuRouter.delete('/categories/:id', canEdit, (req, res) => {
  menuService.deleteCategory(req.user, id(req));
  res.status(204).end();
});

menuRouter.post('/products', canEdit, validate(productSchema), (req, res) => {
  res.status(201).json({ product: menuService.saveProduct(req.user, null, req.body) });
});
menuRouter.put('/products/:id', canEdit, validate(productSchema), (req, res) => {
  res.json({ product: menuService.saveProduct(req.user, id(req), req.body) });
});
menuRouter.delete('/products/:id', canEdit, (req, res) => {
  menuService.deleteProduct(req.user, id(req));
  res.status(204).end();
});
menuRouter.patch(
  '/products/:id/availability',
  requirePermission('carta.editar', 'cocina.operar'),
  validate(z.object({ available: z.boolean() })),
  (req, res) => {
    menuService.setAvailability(req.user, id(req), req.body.available);
    res.status(204).end();
  },
);

menuRouter.post('/products/:id/image', canEdit, upload.single('file'), async (req, res) => {
  res.json({ product: await menuService.setImage(req.user, id(req), req.file) });
});
menuRouter.delete('/products/:id/image', canEdit, (req, res) => {
  menuService.removeImage(req.user, id(req));
  res.status(204).end();
});
menuRouter.post('/products/:id/model', canEdit, upload.single('file'), async (req, res) => {
  res.json({ product: await menuService.setModel(req.user, id(req), req.file) });
});
menuRouter.delete('/products/:id/model', canEdit, (req, res) => {
  res.json({ product: menuService.resetModel(req.user, id(req)) });
});

menuRouter.post(
  '/prices/bulk',
  requirePermission('carta.precios'),
  validate(
    z.object({
      percent: z.coerce.number().min(-90).max(500).refine((v) => v !== 0, 'El porcentaje no puede ser 0'),
      category_id: z.coerce.number().int().positive().nullable().optional(),
      round_to: z.coerce.number().int().refine((v) => [100, 1000, 5000, 10000].includes(v)).default(1000),
    }),
  ),
  (req, res) => res.json({ updated: menuService.bulkAdjust(req.user, req.body) }),
);

menuRouter.post('/promotions', canEdit, validate(promotionSchema), (req, res) => {
  res.status(201).json({ id: menuService.savePromotion(req.user, null, req.body) });
});
menuRouter.put('/promotions/:id', canEdit, validate(promotionSchema), (req, res) => {
  res.json({ id: menuService.savePromotion(req.user, id(req), req.body) });
});
menuRouter.delete('/promotions/:id', canEdit, (req, res) => {
  menuService.deletePromotion(req.user, id(req));
  res.status(204).end();
});
