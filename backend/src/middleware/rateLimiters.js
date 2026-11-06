import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const message = { error: { code: 'RATE_LIMIT', message: 'Demasiadas solicitudes, intentá en unos minutos' } };

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.LOGIN_MAX_ATTEMPTS * 2,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message,
  skip: () => env.isTest,
});

export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.PUBLIC_RATE_LIMIT_PER_MIN,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message,
  skip: () => env.isTest,
});
