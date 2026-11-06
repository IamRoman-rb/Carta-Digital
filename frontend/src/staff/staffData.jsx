/**
 * Datos compartidos por varias pantallas del staff (estado del salón y de la caja),
 * actualizados por eventos en tiempo real.
 */
import { createContext, useContext } from 'react';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/hooks.js';
import { useAuth } from './auth.jsx';
import { useRealtimeEvent } from './realtime.js';

const FloorContext = createContext(null);
const CashContext = createContext(null);

export function StaffDataProvider({ children }) {
  const { can } = useAuth();
  const canFloor = can('salon.ver', 'caja.ver', 'pedidos.crear');
  const canCash = can('caja.ver');
  const floor = useAsync(() => (canFloor ? api.get('/floor') : Promise.resolve(null)), [canFloor]);
  const cash = useAsync(() => (canCash ? api.get('/billing/cash') : Promise.resolve(null)), [canCash]);
  const settings = useAsync(() => api.get('/settings').then((r) => r.settings), []);

  useRealtimeEvent(['tables.changed', 'call.created', 'call.updated', 'session.closed', 'order.created', 'item.updated'], () => floor.reload({ silent: true }), 300);
  useRealtimeEvent(['cash.changed', 'session.closed'], () => cash.reload({ silent: true }), 300);

  return (
    <FloorContext.Provider value={{ ...floor, settings: settings.data, reloadSettings: settings.reload }}>
      <CashContext.Provider value={cash}>{children}</CashContext.Provider>
    </FloorContext.Provider>
  );
}

export const useFloor = () => useContext(FloorContext);
export const useCash = () => useContext(CashContext);

/** Etiqueta de mesas de una sesión: "11 + 12". */
export const tablesLabel = (session) => session?.tables?.map((t) => t.number).join(' + ') ?? '';
