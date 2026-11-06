import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Armchair, Bell, BookOpen, ChartLine, ChefHat, Clock, LogOut, Menu, Plus, Settings, UsersRound, Utensils, Wallet, Wifi, WifiOff, X,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { money, hhmm, minutesSince, initials } from '../../lib/format.js';
import { useNow } from '../../lib/hooks.js';
import { notify } from '../../lib/notify.js';
import { Button, IconButton, cx } from '../../ui/index.jsx';
import { useAuth } from '../auth.jsx';
import { useRealtimeConnection } from '../realtime.js';
import { useCash, useFloor } from '../staffData.jsx';

const NAV = [
  { href: '/salon', label: 'Plano de Salón', icon: Armchair, perms: ['salon.ver'] },
  { href: '/caja', label: 'Caja & Cuentas', icon: Wallet, perms: ['caja.ver'] },
  { href: '/cocina', label: 'Cocina (KDS)', icon: ChefHat, perms: ['cocina.ver'] },
  { href: '/carta', label: 'Carta & Precios', icon: BookOpen, perms: ['carta.ver'] },
  { href: '/informes', label: 'Informes & Métricas', icon: ChartLine, perms: ['informes.ver'] },
  { href: '/equipo', label: 'Equipo de Sala', icon: UsersRound, perms: ['equipo.ver'] },
];

function Brand({ name }) {
  return (
    <div className="flex items-center gap-3 px-2">
      <span className="grid size-11 place-items-center rounded-full bg-primary-container text-white">
        <Utensils className="size-5" aria-hidden="true" />
      </span>
      <span className="leading-tight">
        <span className="block font-headline text-headline-sm font-bold">{name ?? 'MesaAR'}</span>
        <span className="text-micro font-bold tracking-wider text-primary uppercase">Gastro Ops POS</span>
      </span>
    </div>
  );
}

function CashCard() {
  const cash = useCash();
  const c = cash?.data?.cash;
  if (!cash?.data) return null;
  return (
    <Link href="/caja" className="block rounded-card bg-surface-container p-4 text-label">
      <div className="flex items-center justify-between">
        <span className="font-bold tracking-wider uppercase">Caja #{c?.id ?? '—'}</span>
        <span className={cx('flex items-center gap-1 font-semibold', c ? 'text-tertiary' : 'text-error')}>
          <span className={cx('size-2 rounded-full', c ? 'bg-tertiary-container' : 'bg-error')} aria-hidden="true" />
          {c ? 'Abierta' : 'Cerrada'}
        </span>
      </div>
      {c && (
        <dl className="mt-2 grid grid-cols-2 gap-y-1">
          <dt className="text-on-surface-variant">Abrió</dt>
          <dd className="text-right font-semibold">{c.opened_by_name?.split(' ')[0]} · {hhmm(c.opened_at)}</dd>
          <dt className="text-on-surface-variant">Ventas turno</dt>
          <dd className="text-right font-bold text-primary">{money(c.totals.amount)}</dd>
        </dl>
      )}
    </Link>
  );
}

function Sidebar({ onNavigate }) {
  const { user, can, logout } = useAuth();
  const { settings } = useFloor();
  const [location] = useLocation();
  const items = NAV.filter((n) => can(...n.perms));
  const linkCls = (href) =>
    cx('flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition', location.startsWith(href) ? 'bg-primary-container text-white shadow-glow' : 'text-on-surface-variant hover:bg-surface-container');
  return (
    <div className="flex h-full flex-col gap-5 p-4">
      <Brand name={settings?.business_name} />
      <CashCard />
      <nav aria-label="Secciones" className="flex flex-col gap-1">
        {items.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} onClick={onNavigate} className={linkCls(href)} aria-current={location.startsWith(href) ? 'page' : undefined}>
            <Icon className="size-5" aria-hidden="true" /> {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2">
        <Link href="/ajustes" onClick={onNavigate} className={linkCls('/ajustes')}>
          <Settings className="size-5" aria-hidden="true" /> Ajustes POS
        </Link>
        <div className="flex items-center gap-3 rounded-full bg-surface-container p-2 pr-3">
          <span className="grid size-10 place-items-center rounded-full bg-primary-container text-sm font-bold text-white">{initials(user.name)}</span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold">{user.name}</span>
            <span className="block truncate text-micro text-on-surface-variant">{user.role.name}</span>
          </span>
          <IconButton label="Cerrar sesión" icon={LogOut} className="size-9" onClick={logout} />
        </div>
      </div>
    </div>
  );
}

function CallsBell() {
  const { data, reload } = useFloor();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const calls = data?.calls ?? [];
  async function attend(id) {
    try {
      await api.post(`/floor/calls/${id}/attend`);
      reload({ silent: true });
    } catch (err) {
      notify.error(err);
    }
  }
  if (!can('salon.ver', 'caja.ver')) return null;
  return (
    <div className="relative">
      <IconButton label={`Llamados pendientes: ${calls.length}`} icon={Bell} onClick={() => setOpen((o) => !o)} aria-expanded={open} />
      {calls.length > 0 && <span className="pointer-events-none absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-error text-micro font-bold text-white">{calls.length}</span>}
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-card bg-surface-lowest p-3 shadow-overlay" role="dialog" aria-label="Llamados de mesas">
          <p className="label-caps mb-2">Llamados de mesas</p>
          {calls.length === 0 && <p className="p-3 text-sm text-on-surface-variant">Sin llamados pendientes 🎉</p>}
          <ul className="flex flex-col gap-2">
            {calls.map((c) => {
              const detail = c.detail ? JSON.parse(c.detail) : null;
              return (
                <li key={c.id} className="flex items-center gap-3 rounded-2xl bg-surface-low p-3">
                  <span className={cx('grid size-9 shrink-0 place-items-center rounded-full font-bold text-white', c.type === 'cuenta' ? 'bg-secondary' : 'bg-error')}>{c.table_number}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-semibold">{c.type === 'cuenta' ? 'Pide la cuenta' : `Llama al mozo${detail?.reason ? ` · ${detail.reason}` : ''}`}</span>
                    <span className="block text-label text-on-surface-variant">
                      {c.sector_name} · hace {minutesSince(c.created_at)} min{detail?.method ? ` · ${detail.method}` : ''}
                    </span>
                  </span>
                  <Button size="sm" variant="dark" onClick={() => attend(c.id)}>Listo</Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Topbar({ onMenu, rtStatus }) {
  const { data } = useFloor();
  const { can } = useAuth();
  const [, navigate] = useLocation();
  const now = useNow(30_000);
  const sectors = data?.sectors.filter((s) => s.active) ?? [];
  const occupied = new Set(data?.tables.filter((t) => t.session_id).map((t) => t.id));
  return (
    <header className="glass sticky top-0 z-30 border-b border-outline-variant/30">
      <div className="flex h-16 items-center gap-2 px-4">
        <IconButton label="Abrir menú" icon={Menu} className="lg:hidden" onClick={onMenu} />
        <div className="scrollbar-none hidden min-w-0 flex-1 gap-1 overflow-x-auto md:flex">
          {sectors.map((s) => {
            const tables = data.tables.filter((t) => t.sector_id === s.id);
            return (
              <span key={s.id} className="shrink-0 rounded-full bg-surface-container px-3 py-1.5 text-label font-semibold">
                {s.name} <span className="text-on-surface-variant">({tables.filter((t) => occupied.has(t.id)).length}/{tables.length})</span>
              </span>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={cx('hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-label font-semibold sm:flex', rtStatus === 'open' ? 'bg-tertiary-fixed/40 text-tertiary' : 'bg-error-container text-on-error-container')} title="Sincronización en vivo">
            {rtStatus === 'open' ? <Wifi className="size-4" aria-hidden="true" /> : <WifiOff className="size-4" aria-hidden="true" />}
            {rtStatus === 'open' ? 'En vivo' : 'Reconectando'}
          </span>
          <span className="hidden items-center gap-1.5 rounded-full bg-surface-container px-3 py-1.5 text-label font-semibold sm:flex">
            <Clock className="size-4" aria-hidden="true" /> {hhmm(new Date(now).toISOString())}
          </span>
          <CallsBell />
          {can('pedidos.crear') && (
            <Button icon={Plus} onClick={() => navigate('/pedido')} className="hidden sm:inline-flex">
              Nuevo pedido
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

export default function StaffLayout({ children }) {
  const [drawer, setDrawer] = useState(false);
  const rtStatus = useRealtimeConnection(true);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-r border-outline-variant/30 bg-surface-low lg:block">
        <Sidebar />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <button type="button" className="absolute inset-0 bg-on-surface/50" aria-label="Cerrar menú" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-surface-low shadow-overlay">
            <IconButton label="Cerrar menú" icon={X} className="absolute top-3 right-3" onClick={() => setDrawer(false)} />
            <Sidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-col">
        <Topbar onMenu={() => setDrawer(true)} rtStatus={rtStatus} />
        <main id="contenido" className="mx-auto w-full max-w-[1500px] flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
