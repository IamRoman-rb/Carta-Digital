import { useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import {
  Armchair, BellRing, CheckCircle2, ChefHat, Hand, Link2, Move, Pencil, Plus, Printer, QrCode, ReceiptText, Split, Trash2, UserRound, UsersRound, Wallet, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { money, minutesSince } from '../../lib/format.js';
import { ITEM_STATUS } from '../../lib/legal.js';
import { notify } from '../../lib/notify.js';
import { useAsync, useNow } from '../../lib/hooks.js';
import { Badge, Button, Chip, EmptyState, IconButton, Input, Modal, PageHeader, QuantityStepper, Select, Spinner, StatCard, Tabs, cx } from '../../ui/index.jsx';
import { useAuth } from '../auth.jsx';
import { useFloor, tablesLabel } from '../staffData.jsx';
import { useRealtimeEvent } from '../realtime.js';

const SHAPES = {
  round: 'size-24 rounded-full',
  square: 'size-28 rounded-[1.75rem]',
  rect: 'h-28 w-40 rounded-[1.75rem]',
};

function statusOf(table, session, calls) {
  if (!session) return 'free';
  if (calls.some((c) => c.table_id === table.id && c.type === 'mozo')) return 'calling';
  if (session.status === 'billing' || calls.some((c) => c.table_id === table.id && c.type === 'cuenta')) return 'billing';
  return 'open';
}

const STATUS_STYLE = {
  free: { box: 'bg-surface-lowest border-tertiary-container/40', dot: 'bg-tertiary-container', label: 'Disponible' },
  open: { box: 'bg-primary-fixed/40 border-primary-container/50', dot: 'bg-primary-container', label: 'Ocupada' },
  billing: { box: 'bg-secondary-fixed border-secondary-container', dot: 'bg-secondary', label: 'Pide cuenta' },
  calling: { box: 'bg-error-container border-error animate-pulse-ring', dot: 'bg-error', label: 'Llamando' },
};

// ------------------------------------------------------------------ Mesa arrastrable
function TableNode({ table, session, status, selected, mode, onSelect, position, now }) {
  const drag = useDraggable({ id: table.id, data: { table } });
  const drop = useDroppable({ id: table.id, data: { table } });
  const st = STATUS_STYLE[status];
  const merged = session && session.tables.length > 1;
  const style = {
    left: `${position.x}%`,
    top: `${position.y}%`,
    transform: drag.transform ? `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` : undefined,
    zIndex: drag.isDragging ? 30 : selected ? 20 : 10,
  };
  return (
    <div
      ref={(n) => {
        drag.setNodeRef(n);
        drop.setNodeRef(n);
      }}
      style={style}
      {...drag.listeners}
      {...drag.attributes}
      aria-label={`Mesa ${table.number}, ${st.label}${session ? `, ${money(session.total)}` : ''}. ${mode === 'edit' ? 'Arrastrá para mover.' : 'Arrastrá sobre otra mesa para unirlas.'}`}
      aria-pressed={selected}
      onClick={() => onSelect(table.id)}
      className={cx(
        'absolute flex touch-none flex-col items-center justify-center gap-0.5 border-2 p-2 text-center shadow-base transition-[box-shadow,background-color] select-none',
        SHAPES[table.shape],
        st.box,
        selected && 'ring-4 ring-primary/40',
        drop.isOver && !drag.isDragging && 'scale-105 ring-4 ring-secondary-container',
        drag.isDragging ? 'cursor-grabbing opacity-90 shadow-overlay' : 'cursor-grab',
      )}
    >
      <span className="flex items-center gap-1 text-micro font-bold uppercase text-on-surface-variant">
        <span className={cx('size-2 rounded-full', st.dot)} aria-hidden="true" /> Mesa
      </span>
      <span className="font-headline text-headline-md leading-none font-bold">{table.number}</span>
      {session ? (
        <>
          <span className="text-micro font-semibold text-primary">{money(session.total)}</span>
          <span className="flex items-center gap-1 text-micro text-on-surface-variant">
            <UsersRound className="size-3" aria-hidden="true" /> {session.guests} · {minutesSince(session.opened_at, now)}′
          </span>
        </>
      ) : (
        <span className="flex items-center gap-1 text-micro text-on-surface-variant">
          <Armchair className="size-3" aria-hidden="true" /> {table.seats} pax
        </span>
      )}
      {merged && (
        <span className="absolute -top-2 -right-2 flex items-center gap-0.5 rounded-full bg-on-surface px-1.5 py-0.5 text-micro font-bold text-surface">
          <Link2 className="size-3" aria-hidden="true" /> {tablesLabel(session)}
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Panel de detalle
const tableSchema = z.object({
  sector_id: z.coerce.number().int().positive(),
  number: z.coerce.number().int().min(1, 'Número inválido').max(9999),
  label: z.string().max(30).optional(),
  seats: z.coerce.number().int().min(1).max(40),
  shape: z.enum(['round', 'square', 'rect']),
});

function TableForm({ table, sectors, defaultSector, onSaved, onCancel }) {
  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(tableSchema),
    defaultValues: table ?? { sector_id: defaultSector, number: '', seats: 4, shape: 'square', label: '' },
  });
  const onSubmit = handleSubmit(async (d) => {
    try {
      if (table) await api.put(`/floor/tables/${table.id}`, d);
      else await api.post('/floor/tables', { ...d, pos_x: 45, pos_y: 40 });
      notify.toast(table ? 'Mesa actualizada' : 'Mesa creada');
      onSaved();
    } catch (err) {
      notify.error(err);
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-2 gap-3">
      <Select label="Sector" className="col-span-2" error={formState.errors.sector_id} {...register('sector_id')}>
        {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
      <Input label="Número" type="number" inputMode="numeric" error={formState.errors.number} {...register('number')} />
      <Input label="Sillas" type="number" inputMode="numeric" error={formState.errors.seats} {...register('seats')} />
      <Select label="Forma" error={formState.errors.shape} {...register('shape')}>
        <option value="round">Redonda</option>
        <option value="square">Cuadrada</option>
        <option value="rect">Rectangular</option>
      </Select>
      <Input label="Etiqueta (opcional)" placeholder="Ventana, VIP…" {...register('label')} />
      <div className="col-span-2 flex justify-end gap-2 pt-2">
        <Button variant="muted" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" loading={formState.isSubmitting}>Guardar</Button>
      </div>
    </form>
  );
}

function FreeTablePanel({ table, waiters, onOpened }) {
  const { user } = useAuth();
  const [guests, setGuests] = useState(Math.min(2, table.seats));
  const [waiterId, setWaiterId] = useState(user.role.code === 'mozo' ? user.id : '');
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try {
      await api.post(`/floor/tables/${table.id}/open`, { guests, waiterId: waiterId ? Number(waiterId) : null });
      notify.toast(`Mesa ${table.number} abierta`);
      onOpened();
    } catch (err) {
      notify.error(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-2xl bg-tertiary-fixed/30 p-3 text-sm text-tertiary">Mesa libre y lista. Capacidad: {table.seats} personas.</p>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Comensales</span>
        <QuantityStepper value={guests} onChange={setGuests} max={60} />
      </div>
      <Select label="Mozo asignado" value={waiterId} onChange={(e) => setWaiterId(e.target.value)}>
        <option value="">Sin asignar</option>
        {waiters.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </Select>
      <Button icon={Plus} loading={busy} onClick={open}>Abrir mesa</Button>
    </div>
  );
}

function SessionPanel({ sessionId, tables, waiters, calls }) {
  const { can } = useAuth();
  const [, navigate] = useLocation();
  const detail = useAsync(() => api.get(`/floor/sessions/${sessionId}`).then((r) => r.session), [sessionId]);
  useRealtimeEvent(['tables.changed', 'item.updated', 'order.created'], () => detail.reload({ silent: true }));
  const s = detail.data;
  if (!s) return <Spinner />;

  const run = async (fn, ok) => {
    try {
      await fn();
      if (ok) notify.toast(ok);
      detail.reload({ silent: true });
    } catch (err) {
      notify.error(err);
    }
  };
  const freeTables = tables.filter((t) => !t.session_id);
  const items = s.bill.items;

  async function relocate() {
    const options = Object.fromEntries(freeTables.map((t) => [t.id, `Mesa ${t.number}`]));
    const to = await notify.select({ title: 'Reubicar mesa', options, placeholder: 'Elegí una mesa libre', confirmText: 'Mover' });
    if (to) run(() => api.post(`/floor/tables/${s.tables[0].id}/move`, { toTableId: Number(to) }), 'Cuenta reubicada');
  }

  async function precuenta() {
    try {
      const { ticket } = await api.post(`/billing/sessions/${s.id}/precuenta`);
      navigate(`/ticket/${ticket.id}`);
    } catch (err) {
      notify.error(err);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Select label="Mozo" value={s.waiter_id ?? ''} disabled={!can('salon.operar')} onChange={(e) => run(() => api.patch(`/floor/sessions/${s.id}`, { waiterId: e.target.value ? Number(e.target.value) : null }), 'Mozo asignado')}>
          <option value="">Sin asignar</option>
          {waiters.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
        <div className="flex flex-col gap-1.5">
          <span className="text-label font-semibold text-on-surface-variant">Comensales</span>
          <QuantityStepper size="sm" value={s.guests} max={60} onChange={(g) => run(() => api.patch(`/floor/sessions/${s.id}`, { guests: g }))} />
        </div>
      </div>
      <p className="text-label text-on-surface-variant">Permanencia: {minutesSince(s.opened_at)} min · Comanda #{s.id}</p>

      {calls.length > 0 && (
        <ul className="flex flex-col gap-2">
          {calls.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-2xl bg-error-container/70 p-3 text-sm text-on-error-container">
              <BellRing className="size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1 font-semibold">{c.type === 'cuenta' ? 'Pide la cuenta' : 'Llama al mozo'}{c.detail ? ` · ${Object.values(JSON.parse(c.detail)).join(' · ')}` : ''}</span>
              <Button size="sm" variant="dark" onClick={() => run(() => api.post(`/floor/calls/${c.id}/attend`), 'Llamado atendido')}>Atendido</Button>
            </li>
          ))}
        </ul>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="label-caps">Comanda activa</h3>
          {can('pedidos.crear') && <Button size="sm" variant="ghost" icon={Plus} onClick={() => navigate(`/pedido/${s.id}`)}>Agregar ítems</Button>}
        </div>
        {items.length === 0 ? (
          <p className="rounded-2xl bg-surface-low p-3 text-sm text-on-surface-variant">Sin consumos todavía.</p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {items.map((i) => (
              <li key={i.id} className="flex items-start gap-2 rounded-2xl bg-surface-low p-2.5 text-sm">
                <span className="font-bold text-primary">{i.quantity}x</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{i.name}</span>
                  {i.modifiers.length > 0 && <span className="block truncate text-label text-on-surface-variant">{i.modifiers.map((m) => m.name).join(' · ')}</span>}
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="font-semibold">{money(i.line_total)}</span>
                  <span className={cx('rounded-full px-2 text-micro font-bold', ITEM_STATUS[i.status].tone)}>{ITEM_STATUS[i.status].label}</span>
                  {i.status === 'listo' && can('salon.operar') && (
                    <button type="button" className="text-micro font-bold text-tertiary underline" onClick={() => run(() => api.patch(`/orders/items/${i.id}`, { status: 'entregado' }), 'Marcado como servido')}>
                      Servido
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <dl className="rounded-2xl bg-surface-container p-4 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(s.bill.subtotal)}</dd></div>
        {s.bill.discount > 0 && <div className="flex justify-between text-tertiary"><dt>Descuento</dt><dd>-{money(s.bill.discount)}</dd></div>}
        {s.bill.paid > 0 && <div className="flex justify-between"><dt>Pagado</dt><dd>-{money(s.bill.paid)}</dd></div>}
        <div className="mt-2 flex items-end justify-between">
          <dt className="font-headline text-headline-sm font-bold">Total acumulado</dt>
          <dd className="font-headline text-headline-md font-bold text-primary">{money(s.bill.balance)}</dd>
        </div>
      </dl>

      {can('salon.operar') && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="muted" icon={Move} onClick={relocate} disabled={!freeTables.length}>Reubicar</Button>
          <Button variant="muted" icon={Printer} onClick={precuenta} disabled={!items.length}>Pre-cuenta</Button>
          {s.tables.length > 1 &&
            s.tables.map((t) => (
              <Button key={t.id} variant="muted" icon={Split} onClick={() => run(() => api.post(`/floor/tables/${t.id}/separate`), `Mesa ${t.number} separada`)}>
                Separar {t.number}
              </Button>
            ))}
          <Button variant="muted" icon={ChefHat} onClick={() => navigate('/cocina')}>Estado cocina</Button>
          {!items.length && (
            <Button variant="muted" icon={X} onClick={async () => (await notify.confirm({ title: '¿Liberar la mesa?', text: 'La mesa no tiene consumos.', confirmText: 'Liberar' })) && run(() => api.del(`/floor/sessions/${s.id}`), 'Mesa liberada')}>
              Liberar mesa
            </Button>
          )}
        </div>
      )}
      {can('caja.ver') && (
        <Button size="lg" icon={Wallet} onClick={() => navigate(`/caja?sesion=${s.id}`)}>Cobrar / Emitir ticket</Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Página
export default function FloorPage() {
  const { can } = useAuth();
  const { data, loading, reload } = useFloor();
  const waiters = useAsync(() => api.get('/users/waiters').then((r) => r.waiters), []);
  const now = useNow(30_000);
  const canvasRef = useRef(null);
  const [sectorId, setSectorId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('service');
  const [filter, setFilter] = useState('all');
  const [zoom, setZoom] = useState(1);
  const [overrides, setOverrides] = useState({});
  const [tableModal, setTableModal] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const sessionsById = useMemo(() => new Map((data?.sessions ?? []).map((s) => [s.id, s])), [data]);
  if (loading && !data) return <Spinner />;
  if (!data) return null;

  const sectors = data.sectors.filter((s) => s.active);
  const currentSector = sectorId ?? sectors[0]?.id;
  const sectorTables = data.tables.filter((t) => t.sector_id === currentSector);
  const calls = data.calls;
  const withStatus = sectorTables.map((t) => {
    const session = t.session_id ? sessionsById.get(t.session_id) : null;
    return { table: t, session, status: statusOf(t, session, calls) };
  });
  const visible = withStatus.filter(({ status }) => filter === 'all' || (filter === 'busy' ? status !== 'free' : ['calling', 'billing'].includes(status)));
  const selected = data.tables.find((t) => t.id === selectedId);
  const selectedSession = selected?.session_id ? sessionsById.get(selected.session_id) : null;

  const all = data.tables;
  const occupiedCount = all.filter((t) => t.session_id).length;
  const billingCount = data.sessions.filter((s) => s.status === 'billing').length;
  const callingCount = calls.filter((c) => c.type === 'mozo').length;
  const openTotal = data.sessions.reduce((s, x) => s + x.total, 0);

  async function onDragEnd({ active, over, delta }) {
    const source = data.tables.find((t) => t.id === active.id);
    if (mode === 'service') {
      if (!over || over.id === active.id) return;
      if (!can('salon.operar')) return notify.toast('No tenés permiso para unir mesas', 'error');
      const target = data.tables.find((t) => t.id === over.id);
      const ok = await notify.confirm({
        title: `¿Unir mesa ${source.number} con mesa ${target.number}?`,
        text: 'Las cuentas se juntan en una sola: consumos, pagos y comensales pasan a la cuenta de destino.',
        confirmText: 'Unir mesas',
      });
      if (!ok) return;
      try {
        await api.post('/floor/merge', { sourceTableId: source.id, targetTableId: target.id });
        notify.toast(`Mesas ${source.number} + ${target.number} unidas`);
        setSelectedId(target.id);
        reload({ silent: true });
      } catch (err) {
        notify.error(err);
      }
      return;
    }
    // Modo edición: mover la mesa dentro del plano.
    const rect = canvasRef.current.getBoundingClientRect();
    const cur = overrides[source.id] ?? { x: source.pos_x, y: source.pos_y };
    const next = {
      x: Math.round(Math.min(92, Math.max(0, cur.x + (delta.x / rect.width) * 100)) * 10) / 10,
      y: Math.round(Math.min(88, Math.max(0, cur.y + (delta.y / rect.height) * 100)) * 10) / 10,
    };
    setOverrides((o) => ({ ...o, [source.id]: next }));
    try {
      await api.put('/floor/positions', { positions: [{ id: source.id, pos_x: next.x, pos_y: next.y }] });
    } catch (err) {
      notify.error(err);
      setOverrides((o) => ({ ...o, [source.id]: cur }));
    }
  }

  async function deleteTable(t) {
    if (!(await notify.confirm({ title: `¿Eliminar la mesa ${t.number}?`, text: 'Su QR dejará de funcionar.', confirmText: 'Eliminar', danger: true }))) return;
    try {
      await api.del(`/floor/tables/${t.id}`);
      setSelectedId(null);
      reload({ silent: true });
    } catch (err) {
      notify.error(err);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Servicio en vivo"
        title="Plano de salón"
        description="Arrastrá una mesa sobre otra para unirlas: las cuentas se juntan automáticamente."
        actions={
          can('salon.editar_plano') && (
            <Tabs
              value={mode}
              onChange={(m) => {
                setMode(m);
                setOverrides({});
              }}
              tabs={[{ value: 'service', label: 'Servicio en vivo' }, { value: 'edit', label: 'Modo edición' }]}
            />
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Capacidad (mesas)" value={all.length} hint={`${all.reduce((s, t) => s + t.seats, 0)} sillas`} icon={Armchair} />
        <StatCard label={`Ocupadas (${all.length ? Math.round((occupiedCount / all.length) * 100) : 0}%)`} value={occupiedCount} icon={UsersRound} tone="honey" />
        <StatCard label="Libres" value={all.length - occupiedCount} icon={CheckCircle2} tone="sage" />
        <StatCard label="Pidiendo cuenta" value={billingCount} icon={ReceiptText} />
        <StatCard label="Llamando mozo" value={callingCount} icon={BellRing} tone={callingCount ? 'alert' : 'neutral'} />
        <StatCard label="Consumo abierto" value={money(openTotal)} icon={Wallet} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <section className="card flex min-w-0 flex-col gap-4 p-4 lg:p-5" aria-label="Plano">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              value={currentSector}
              onChange={(v) => {
                setSectorId(v);
                setSelectedId(null);
              }}
              tabs={sectors.map((s) => ({ value: s.id, label: s.name, count: `${data.tables.filter((t) => t.sector_id === s.id && t.session_id).length}/${data.tables.filter((t) => t.sector_id === s.id).length}` }))}
            />
            <div className="flex flex-wrap items-center gap-2">
              {mode === 'service' ? (
                ['all', 'busy', 'urgent'].map((f) => (
                  <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
                    {{ all: 'Todas', busy: 'Ocupadas', urgent: 'Urgentes' }[f]}
                  </Chip>
                ))
              ) : (
                <Button size="sm" icon={Plus} onClick={() => setTableModal({})}>Agregar mesa</Button>
              )}
              <IconButton label="Alejar" icon={ZoomOut} onClick={() => setZoom((z) => Math.max(0.8, z - 0.2))} />
              <IconButton label="Acercar" icon={ZoomIn} onClick={() => setZoom((z) => Math.min(1.6, z + 0.2))} />
            </div>
          </div>

          <p className="flex items-center gap-2 rounded-2xl bg-surface-low px-3 py-2 text-label text-on-surface-variant">
            <Hand className="size-4 shrink-0" aria-hidden="true" />
            {mode === 'service' ? 'Tocá una mesa para ver su cuenta. Mantené presionado y soltala sobre otra para unirlas.' : 'Arrastrá las mesas para acomodar el plano. Los cambios se guardan solos.'}
          </p>

          <div className="overflow-auto rounded-card bg-surface-low">
            <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>
              <div
                ref={canvasRef}
                className="relative aspect-[16/10]"
                style={{
                  width: `${zoom * 100}%`,
                  minWidth: `${Math.round(720 * zoom)}px`,
                  backgroundImage: 'radial-gradient(circle, rgb(141 113 104 / 0.25) 1px, transparent 1px)',
                  backgroundSize: '24px 24px',
                }}
              >
                {visible.map(({ table, session, status }) => (
                  <TableNode
                    key={table.id}
                    table={table}
                    session={session}
                    status={status}
                    mode={mode}
                    now={now}
                    selected={table.id === selectedId}
                    onSelect={setSelectedId}
                    position={overrides[table.id] ?? { x: table.pos_x, y: table.pos_y }}
                  />
                ))}
                {sectorTables.length === 0 && (
                  <div className="absolute inset-0 grid place-items-center p-6">
                    <EmptyState icon={Armchair} title="Este sector no tiene mesas" text={can('salon.editar_plano') ? 'Pasá a "Modo edición" para agregarlas.' : undefined} />
                  </div>
                )}
              </div>
            </DndContext>
          </div>

          <ul className="flex flex-wrap gap-4 text-label font-semibold" aria-label="Referencias">
            {Object.entries(STATUS_STYLE).map(([k, v]) => (
              <li key={k} className="flex items-center gap-1.5"><span className={cx('size-3 rounded-full', v.dot)} aria-hidden="true" /> {v.label}</li>
            ))}
            <li className="flex items-center gap-1.5"><Link2 className="size-3.5" aria-hidden="true" /> Mesas unidas</li>
          </ul>
        </section>

        <aside className="card h-fit p-5 xl:sticky xl:top-20" aria-label="Detalle de mesa">
          {!selected ? (
            <EmptyState icon={UserRound} title="Seleccioná una mesa" text="Vas a ver su comanda, el mozo asignado y las acciones disponibles." />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-14 place-items-center rounded-full bg-primary-fixed font-headline text-headline-md font-bold text-primary">{selected.number}</span>
                  <div>
                    <h2 className="font-headline text-headline-md font-bold">Mesa {selectedSession ? tablesLabel(selectedSession) : selected.number}</h2>
                    <p className="text-label text-on-surface-variant">{selected.seats} sillas · {sectors.find((s) => s.id === selected.sector_id)?.name}{selected.label ? ` · ${selected.label}` : ''}</p>
                  </div>
                </div>
                <IconButton label="Cerrar detalle" icon={X} className="size-9" onClick={() => setSelectedId(null)} />
              </div>
              <Badge tone={selectedSession ? 'primary' : 'sage'}>{selectedSession ? STATUS_STYLE[statusOf(selected, selectedSession, calls)].label : 'Disponible'}</Badge>

              {mode === 'edit' ? (
                <div className="flex flex-col gap-2">
                  <Button variant="muted" icon={Pencil} onClick={() => setTableModal({ table: selected })}>Editar mesa</Button>
                  <Button variant="muted" icon={QrCode} onClick={() => window.open(`/m/${selected.qr_token}`, '_blank', 'noopener')}>Probar QR de la mesa</Button>
                  <Button
                    variant="muted"
                    icon={QrCode}
                    onClick={async () => (await notify.confirm({ title: '¿Regenerar QR?', text: 'El QR impreso actual dejará de funcionar.', danger: true })) && api.post(`/floor/tables/${selected.id}/regenerate-qr`).then(() => reload({ silent: true }), notify.error)}
                  >
                    Regenerar QR
                  </Button>
                  <Button variant="danger" icon={Trash2} onClick={() => deleteTable(selected)} disabled={!!selectedSession}>Eliminar mesa</Button>
                </div>
              ) : selectedSession ? (
                <SessionPanel sessionId={selectedSession.id} tables={data.tables} waiters={waiters.data ?? []} calls={calls.filter((c) => selectedSession.tables.some((t) => t.id === c.table_id))} />
              ) : can('salon.operar', 'pedidos.crear') ? (
                <FreeTablePanel table={selected} waiters={waiters.data ?? []} onOpened={() => reload({ silent: true })} />
              ) : null}
            </div>
          )}
        </aside>
      </div>

      <Modal open={!!tableModal} onClose={() => setTableModal(null)} title={tableModal?.table ? `Editar mesa ${tableModal.table.number}` : 'Nueva mesa'} size="sm">
        {tableModal && (
          <TableForm
            table={tableModal.table}
            sectors={sectors}
            defaultSector={currentSector}
            onCancel={() => setTableModal(null)}
            onSaved={() => {
              setTableModal(null);
              reload({ silent: true });
            }}
          />
        )}
      </Modal>
    </div>
  );
}
