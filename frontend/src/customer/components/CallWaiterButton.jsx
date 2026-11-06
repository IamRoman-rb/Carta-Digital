import { useState } from 'react';
import { BellRing, Droplets, HandHelping, ReceiptText, Utensils, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { notify } from '../../lib/notify.js';
import { useCart, tableActions, tableApi } from '../store.js';
import { cx } from '../../ui/index.jsx';

const REASONS = [
  { reason: 'Asistencia', icon: HandHelping },
  { reason: 'Agua', icon: Droplets },
  { reason: 'Cubiertos', icon: Utensils },
];

/** Botón flotante de servicio: llama al mozo o lleva a pedir la cuenta. */
export default function CallWaiterButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [location, navigate] = useLocation();
  const cartHasItems = useCart().length > 0;
  async function toggle() {
    if (open) return setOpen(false);
    // Para llamar al mozo hay que haber escaneado el QR de la mesa.
    if (await tableActions.ensure('Escaneá el QR de tu mesa para que el mozo sepa adónde ir.')) setOpen(true);
  }

  async function call(reason) {
    setBusy(true);
    try {
      const r = await tableApi.post('/calls', { type: 'mozo', detail: { reason } });
      notify.toast(r.duplicated ? 'Ya avisamos al mozo, enseguida viene' : 'Avisamos al mozo 🙌');
      setOpen(false);
    } catch (err) {
      notify.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cx('fixed right-4 z-40 flex flex-col items-end gap-2', (location === '/' && cartHasItems) || location.startsWith('/plato') ? 'bottom-40' : 'bottom-24')}>
      {open && (
        <div className="hud flex flex-col gap-1 rounded-card p-2 text-white shadow-overlay" role="menu">
          {REASONS.map(({ reason, icon: Icon }) => (
            <button key={reason} role="menuitem" disabled={busy} onClick={() => call(reason)} className="flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold hover:bg-white/10">
              <Icon className="size-5 text-secondary-container" aria-hidden="true" /> {reason}
            </button>
          ))}
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate('/cuenta');
            }}
            className="flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold hover:bg-white/10"
          >
            <ReceiptText className="size-5 text-secondary-container" aria-hidden="true" /> Pedir la cuenta
          </button>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Cerrar menú de servicio' : 'Llamar al mozo'}
        onClick={toggle}
        className={cx('flex h-14 items-center gap-2 rounded-full bg-on-surface px-5 text-sm font-semibold text-surface shadow-raised', !open && 'animate-pulse-ring')}
      >
        {open ? <X className="size-5" aria-hidden="true" /> : <BellRing className="size-5 text-secondary-container" aria-hidden="true" />}
        {open ? 'Cerrar' : 'Llamar mozo'}
      </button>
    </div>
  );
}
