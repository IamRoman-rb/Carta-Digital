import { useState } from 'react';
import { AlarmClock, BellRing, CheckCheck, ChefHat, Circle, CircleCheck, CircleDot, Flame, Layers, Maximize, PackageX, Timer, Volume2, VolumeX, Zap } from 'lucide-react';
import { api } from '../../lib/api.js';
import { elapsed, hhmm, minutesSince } from '../../lib/format.js';
import { ITEM_STATUS, STATION_LABELS } from '../../lib/legal.js';
import { notify } from '../../lib/notify.js';
import { useAsync, useNow, readStored, writeStored } from '../../lib/hooks.js';
import { Badge, Button, EmptyState, IconButton, PageHeader, Spinner, StatCard, Tabs, cx } from '../../ui/index.jsx';
import { useAuth } from '../auth.jsx';
import { useFloor } from '../staffData.jsx';
import { useRealtimeEvent } from '../realtime.js';

/** Aviso sonoro corto sin archivos de audio (Web Audio API). */
function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.5);
  } catch {
    /* sin audio disponible */
  }
}

const NEXT = { pendiente: 'preparando', preparando: 'listo', listo: 'entregado' };
const ICON = { pendiente: Circle, preparando: CircleDot, listo: CircleCheck };

function TicketCard({ t, now, warn, late, canOperate, onItem, onOrder, onNoStock }) {
  const mins = minutesSince(t.created_at, now);
  const level = mins >= late ? 'late' : mins >= warn ? 'warn' : 'ok';
  const active = t.items.filter((i) => i.status !== 'listo');
  const allPending = t.items.every((i) => i.status === 'pendiente');
  const header = { ok: 'bg-surface-container', warn: 'bg-secondary-fixed', late: 'bg-error-container' }[level];
  const timer = { ok: 'bg-tertiary text-white', warn: 'bg-secondary-container text-on-secondary-container', late: 'bg-error text-white' }[level];
  return (
    <article className={cx('flex flex-col overflow-hidden rounded-card bg-surface-lowest shadow-base', level === 'late' && 'ring-2 ring-error')}>
      <header className={cx('flex items-start justify-between gap-2 p-4', header)}>
        <div>
          <p className="text-label font-bold uppercase">Ticket #{t.order_id} · {t.tables[0]?.sector_name}</p>
          <h3 className="font-headline text-headline-md font-bold">Mesa {t.tables.map((x) => x.number).join(' + ')}</h3>
          <p className="text-label">Mozo: {t.waiter_name ?? '—'} · {t.source === 'cliente' ? 'Pedido por QR' : `Cargó ${t.created_by_name ?? 'staff'}`} · {hhmm(t.created_at)}</p>
        </div>
        <span className={cx('flex items-center gap-1 rounded-full px-3 py-1.5 font-mono text-sm font-bold', timer)} aria-label={`${mins} minutos en cocina`}>
          {level === 'late' ? <AlarmClock className="size-4" aria-hidden="true" /> : <Timer className="size-4" aria-hidden="true" />}
          {elapsed(t.created_at, now)}
        </span>
      </header>
      {t.notes && <p className="bg-primary-fixed/40 px-4 py-2 text-sm font-semibold text-primary">Nota: “{t.notes}”</p>}
      <ul className="flex flex-1 flex-col divide-y divide-outline-variant/30">
        {t.items.map((i) => {
          const Icon = ICON[i.status];
          return (
            <li key={i.id} className={cx('flex gap-3 p-4', i.status === 'listo' && 'opacity-60')}>
              <button
                type="button"
                disabled={!canOperate}
                onClick={() => onItem(i, NEXT[i.status])}
                aria-label={`${i.name}: pasar a ${ITEM_STATUS[NEXT[i.status]].label}`}
                className="mt-0.5 shrink-0 text-primary disabled:opacity-40"
              >
                <Icon className="size-7" aria-hidden="true" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="font-headline text-headline-sm font-bold">
                  <span className="text-primary">{i.quantity}x</span> {i.name}
                </p>
                {i.modifiers.length > 0 && <p className="text-sm text-on-surface-variant">{i.modifiers.map((m) => m.name).join(' · ')}</p>}
                {i.notes && <p className="mt-1 rounded-xl bg-primary-fixed/50 px-2 py-1 text-sm font-semibold text-primary">“{i.notes}”</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge>{STATION_LABELS[i.station]}</Badge>
                  <span className={cx('rounded-full px-2.5 py-0.5 text-label font-bold', ITEM_STATUS[i.status].tone)}>{ITEM_STATUS[i.status].label}</span>
                  {canOperate && i.status === 'pendiente' && (
                    <button type="button" className="ml-auto flex items-center gap-1 text-label font-semibold text-error" onClick={() => onNoStock(i)}>
                      <PackageX className="size-3.5" aria-hidden="true" /> Sin stock
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {canOperate && active.length > 0 && (
        <footer className="p-3">
          <Button size="lg" className="w-full rounded-2xl" icon={allPending ? Flame : CheckCheck} variant={level === 'late' ? 'danger' : 'primary'} onClick={() => onOrder(t, allPending ? 'preparando' : 'listo')}>
            {allPending ? 'Marchar todo a fuegos' : level === 'late' ? 'Prioridad: todo al pase' : 'Todo listo al pase'}
          </Button>
        </footer>
      )}
    </article>
  );
}

export default function KitchenPage() {
  const { can } = useAuth();
  const { settings } = useFloor();
  const [station, setStation] = useState('');
  const [sound, setSound] = useState(() => readStored('kds-sound') ?? true);
  const now = useNow(1000);
  const board = useAsync(() => api.get(`/orders/kitchen${station ? `?station=${station}` : ''}`), [station]);
  const ready = useAsync(() => api.get('/orders/ready').then((r) => r.items), []);
  useRealtimeEvent(['order.created', 'item.updated', 'tables.changed', 'session.closed'], () => {
    board.reload({ silent: true });
    ready.reload({ silent: true });
  });
  useRealtimeEvent(['order.created'], () => sound && beep(), 0);

  const canOperate = can('cocina.operar');
  const warn = settings?.kds_warn_minutes ?? 10;
  const late = settings?.kds_late_minutes ?? 18;

  const act = async (fn) => {
    try {
      await fn();
      board.reload({ silent: true });
      ready.reload({ silent: true });
    } catch (err) {
      notify.error(err);
    }
  };

  if (!board.data) return <Spinner />;
  const { tickets, batch, stats, stations } = board.data;
  const lateCount = tickets.filter((t) => minutesSince(t.created_at, now) >= late).length;
  const plates = tickets.reduce((s, t) => s + t.items.reduce((n, i) => n + (i.status !== 'listo' ? i.quantity : 0), 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Despacho y marcha en vivo"
        title="Monitor de cocina"
        description="Tocá el círculo de cada plato para avanzar: en cola → en fuegos → listo."
        actions={
          <>
            <Button variant="muted" icon={sound ? Volume2 : VolumeX} onClick={() => { setSound(!sound); writeStored('kds-sound', !sound); }}>
              Alertas sonoras: {sound ? 'sí' : 'no'}
            </Button>
            <IconButton label="Pantalla completa" icon={Maximize} onClick={() => document.documentElement.requestFullscreen?.()} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tiempo promedio de salida" value={stats.avg_minutes ? `${stats.avg_minutes.toFixed(1)} min` : '—'} hint={`${stats.done} platos hoy`} icon={Timer} tone="sage" />
        <StatCard label="Comandas en marcha" value={tickets.length} hint={`${plates} platos activos`} icon={ChefHat} />
        <StatCard label={`Demoradas (> ${late} min)`} value={lateCount} icon={AlarmClock} tone={lateCount ? 'alert' : 'neutral'} />
        <StatCard label="Listas en el pase" value={ready.data?.length ?? 0} hint="Esperando al mozo" icon={BellRing} tone="honey" />
      </div>

      <Tabs
        value={station}
        onChange={setStation}
        tabs={[{ value: '', label: 'Todas las estaciones' }, ...Object.entries(STATION_LABELS).map(([k, v]) => ({ value: k, label: v, count: stations.find((s) => s.station === k)?.tickets }))]}
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <section aria-label="Comandas en línea de cocción">
          {tickets.length === 0 ? (
            <EmptyState icon={ChefHat} title="Sin comandas pendientes" text="Cuando entre un pedido vas a escucharlo y verlo acá." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {tickets.map((t) => (
                <TicketCard
                  key={t.order_id}
                  t={t}
                  now={now}
                  warn={warn}
                  late={late}
                  canOperate={canOperate}
                  onItem={(i, status) => act(() => api.patch(`/orders/items/${i.id}`, { status }))}
                  onOrder={(tk, status) => act(() => api.patch(`/orders/${tk.order_id}/status`, { status }))}
                  onNoStock={async (i) => {
                    const reason = 'Sin stock';
                    if (!(await notify.confirm({ title: `¿Sin stock de ${i.name}?`, text: 'Se anula el ítem y el plato se pausa en la carta (deja de verse en el menú).', confirmText: 'Pausar plato', danger: true }))) return;
                    act(async () => {
                      await api.patch(`/orders/items/${i.id}`, { status: 'anulado', reason });
                      if (i.product_id) await api.patch(`/menu/products/${i.product_id}/availability`, { available: false });
                    });
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-5">
          <section className="card p-4" aria-labelledby="batch">
            <h2 id="batch" className="mb-3 flex items-center gap-2 font-headline text-headline-sm font-bold"><Layers className="size-5 text-primary" aria-hidden="true" /> Cocción en bloque</h2>
            {batch.length === 0 && <p className="text-sm text-on-surface-variant">Nada en cola.</p>}
            <ul className="flex flex-col gap-2">
              {batch.map((b) => (
                <li key={`${b.name}-${b.station}`} className="flex items-center gap-3 rounded-2xl bg-surface-low p-3">
                  <span className="grid size-10 place-items-center rounded-full bg-primary-container font-headline font-bold text-white">{b.quantity}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{b.name}</span>
                    <span className="text-label text-on-surface-variant">{b.in_progress} en fuegos · {b.quantity - b.in_progress} en cola</span>
                  </span>
                  <Badge>{STATION_LABELS[b.station]}</Badge>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-4" aria-labelledby="pase">
            <h2 id="pase" className="mb-3 flex items-center gap-2 font-headline text-headline-sm font-bold"><BellRing className="size-5 text-tertiary" aria-hidden="true" /> Pase de salida</h2>
            {(ready.data ?? []).length === 0 && <p className="text-sm text-on-surface-variant">No hay platos esperando.</p>}
            <ul className="flex flex-col gap-2">
              {(ready.data ?? []).map((r) => (
                <li key={r.id} className="flex flex-col gap-2 rounded-2xl bg-surface-low p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-headline text-headline-sm font-bold text-tertiary">Mesa {r.tables.join(' + ')}</span>
                    <span className="rounded-full bg-tertiary-fixed/60 px-2 py-0.5 text-label font-bold text-tertiary">Listo hace {minutesSince(r.ready_at, now)} min</span>
                  </div>
                  <p className="text-sm">{r.quantity}x {r.name} · <span className="text-on-surface-variant">{r.waiter_name ?? 'Sin mozo'}</span></p>
                  {can('cocina.operar', 'salon.operar') && (
                    <Button size="sm" variant="dark" icon={Zap} onClick={() => act(() => api.patch(`/orders/items/${r.id}`, { status: 'entregado' }))}>Confirmar entregado</Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
