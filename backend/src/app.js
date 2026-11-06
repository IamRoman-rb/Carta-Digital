import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { menuRouter } from './modules/menu/menu.routes.js';
import { floorRouter } from './modules/floor/floor.routes.js';
import { ordersRouter } from './modules/orders/orders.routes.js';
import { billingRouter } from './modules/billing/billing.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { publicRouter } from './modules/public/public.routes.js';
import { realtimeRouter } from './modules/realtime/realtime.routes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'", "'wasm-unsafe-eval'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'", 'blob:', 'data:'],
          'worker-src': ["'self'", 'blob:'],
          'media-src': ["'self'", 'blob:'],
          'object-src': ["'none'"],
          'frame-ancestors': ["'none'"],
        },
      },
    }),
  );
  // Sensores que usa la carta: cámara (QR de mesa y AR), WebXR y orientación del celular. El resto, bloqueado.
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(self), xr-spatial-tracking=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self), microphone=(), geolocation=(), payment=()');
    next();
  });
  app.use(
    compression({
      filter: (req, res) => !req.path.endsWith('/stream') && compression.filter(req, res),
    }),
  );
  app.use(
    '/api',
    cors({
      origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  // Archivos subidos: nombres con hash => caché inmutable (ahorro de datos móviles).
  app.use(
    '/uploads',
    express.static(env.uploadDir, {
      immutable: true,
      maxAge: '365d',
      fallthrough: false,
      setHeaders: (res, filePath) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (filePath.endsWith('.glb')) res.setHeader('Content-Type', 'model/gltf-binary');
      },
    }),
  );

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/menu', menuRouter);
  app.use('/api/floor', floorRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/realtime', realtimeRouter);
  app.use('/api', notFoundHandler);

  // Despliegue en un solo proceso (ej. hosting Node de DonWeb): sirve el build del frontend.
  if (env.frontendDir && fs.existsSync(path.join(env.frontendDir, 'index.html'))) {
    app.use(
      express.static(env.frontendDir, {
        index: false,
        setHeaders: (res, filePath) => {
          const noCache = filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('.webmanifest');
          res.setHeader('Cache-Control', noCache ? 'no-cache' : 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(env.frontendDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
