import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { loginLimiter } from '../../middleware/rateLimiters.js';
import { usersRepository } from '../users/users.repository.js';
import { authService, profileOf } from './auth.service.js';
import { passwordSchema } from './password.js';

const COOKIE = 'mr_refresh';
const cookieOptions = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAMESITE,
  path: '/api/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
});

const respond = (res, { accessToken, refreshToken, user }) => {
  res.cookie(COOKIE, refreshToken, cookieOptions());
  res.json({ accessToken, user });
};

export const authRouter = Router();

authRouter.post(
  '/login',
  loginLimiter,
  validate(z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) })),
  async (req, res) => respond(res, await authService.login(req.body.username, req.body.password)),
);

authRouter.post('/refresh', (req, res) => respond(res, authService.refresh(req.cookies?.[COOKIE])));

authRouter.post('/logout', (req, res) => {
  authService.logout(req.cookies?.[COOKIE]);
  res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.status(204).end();
});

authRouter.get('/me', authenticate, (req, res) => res.json({ user: profileOf(usersRepository.findById(req.user.id)) }));

authRouter.post(
  '/change-password',
  authenticate,
  validate(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema })),
  async (req, res) => respond(res, await authService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword)),
);
