/**
 * Bus de eventos de dominio (patrón Observer).
 * Los servicios publican; el módulo realtime (SSE) y otros suscriptores reaccionan
 * sin acoplarse entre sí.
 */
import { EventEmitter } from 'node:events';

class EventBus extends EventEmitter {
  publish(type, payload = {}) {
    this.emit('domain-event', { type, payload, at: new Date().toISOString() });
  }
}

export const eventBus = new EventBus();
eventBus.setMaxListeners(500);

export const Events = Object.freeze({
  ORDER_CREATED: 'order.created',
  ITEM_UPDATED: 'item.updated',
  TABLES_CHANGED: 'tables.changed',
  CALL_CREATED: 'call.created',
  CALL_UPDATED: 'call.updated',
  SESSION_CLOSED: 'session.closed',
  MENU_CHANGED: 'menu.changed',
  CASH_CHANGED: 'cash.changed',
});
