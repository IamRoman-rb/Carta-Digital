/**
 * Server-Sent Events: suscriptor del bus de dominio (Observer) que reenvía
 * eventos a las terminales del staff. Más liviano que WebSockets y compatible
 * con hosting compartido detrás de proxy.
 */
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { eventBus } from '../../core/eventBus.js';

export const realtimeRouter = Router();

realtimeRouter.get('/stream', authenticate, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n');

  const send = (event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
  eventBus.on('domain-event', send);

  req.on('close', () => {
    clearInterval(heartbeat);
    eventBus.off('domain-event', send);
  });
});
