/**
 * Conexión SSE única por terminal + bus local (Observer) al que se suscriben las pantallas.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { refreshSession, streamUrl } from '../lib/api.js';

const listeners = new Set();
const EVENT_TYPES = ['order.created', 'item.updated', 'tables.changed', 'call.created', 'call.updated', 'session.closed', 'menu.changed', 'cash.changed'];

/** Abre y mantiene la conexión. Devuelve el estado: connecting | open | error. */
export function useRealtimeConnection(enabled) {
  const [status, setStatus] = useState('connecting');
  useEffect(() => {
    if (!enabled) return undefined;
    let es;
    let retry;
    let closed = false;
    const connect = () => {
      es = new EventSource(streamUrl());
      es.onopen = () => setStatus('open');
      es.onerror = () => {
        setStatus('error');
        es.close();
        if (closed) return;
        // El token de acceso pudo expirar: se renueva antes de reconectar.
        retry = setTimeout(() => refreshSession().catch(() => null).finally(connect), 4000);
      };
      for (const type of EVENT_TYPES) {
        es.addEventListener(type, (e) => {
          const event = JSON.parse(e.data);
          listeners.forEach((l) => l(event));
        });
      }
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      es?.close();
    };
  }, [enabled]);
  return status;
}

/** Ejecuta handler (con debounce) cuando llega alguno de los tipos indicados. */
export function useRealtimeEvent(types, handler, debounceMs = 250) {
  const ref = useRef(handler);
  useLayoutEffect(() => {
    ref.current = handler;
  });
  const key = types.join(',');
  useEffect(() => {
    let timer;
    const wanted = new Set(key.split(','));
    const listener = (event) => {
      if (!wanted.has(event.type)) return;
      clearTimeout(timer);
      timer = setTimeout(() => ref.current(event), debounceMs);
    };
    listeners.add(listener);
    return () => {
      clearTimeout(timer);
      listeners.delete(listener);
    };
  }, [key, debounceMs]);
}
