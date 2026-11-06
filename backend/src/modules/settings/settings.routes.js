import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../core/utils.js';
import { settingsService } from './settings.service.js';

export const settingsRouter = Router();
settingsRouter.use(authenticate);

settingsRouter.get('/', (_req, res) => res.json({ settings: settingsService.all() }));

settingsRouter.put('/', requirePermission('ajustes.editar'), (req, res) => {
  const settings = settingsService.update(req.body ?? {});
  audit(req.user.id, 'editar_ajustes', 'settings', null, Object.keys(req.body ?? {}));
  res.json({ settings });
});
