import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { reportsService } from './reports.service.js';

export const reportsRouter = Router();
reportsRouter.use(authenticate, requirePermission('informes.ver'));

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha AAAA-MM-DD');
const range = validate(z.object({ from: ymd, to: ymd }), 'query');

reportsRouter.get('/summary', range, (req, res) => res.json(reportsService.summary(req.validQuery.from, req.validQuery.to)));

reportsRouter.get('/export.csv', range, (req, res) => {
  const { from, to } = req.validQuery;
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="informe_${from}_${to}.csv"` });
  res.send(reportsService.csv(from, to));
});
