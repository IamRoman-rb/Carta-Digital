import { badRequest } from '../core/errors.js';

/** Valida y normaliza req[source] con un esquema zod. */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(badRequest('Datos inválidos', details));
  }
  if (source === 'query') req.validQuery = result.data;
  else req[source] = result.data;
  next();
};
