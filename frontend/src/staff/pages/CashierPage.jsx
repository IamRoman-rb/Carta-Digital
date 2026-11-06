import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Banknote, BellRing, Calculator, CheckCircle2, CreditCard, Landmark, ListChecks, Lock, LockOpen, Percent, Printer, QrCode, ReceiptText, Split, TrendingUp, Wallet,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { money, hhmm, minutesSince, toCents, toPesos } from '../../lib/format.js';
import { IVA_LABELS, PAYMENT_LABELS } from '../../lib/legal.js';
import { notify } from '../../lib/notify.js';
import { useAsync } from '../../lib/hooks.js';
import { Badge, Button, EmptyState, Input, Modal, PageHeader, QuantityStepper, Spinner, StatCard, Tabs, cx } from '../../ui/index.jsx';
import { useAuth } from '../auth.jsx';
import { useCash, useFloor, tablesLabel } from '../staffData.jsx';
import { useRealtimeEvent } from '../realtime.js';

const METHODS = [
  { value: 'qr', icon: QrCode, hint: 'Interoperable' },
  { value: 'debito', icon: CreditCard, hint: 'Posnet' },
  { value: 'credito', icon: CreditCard, hint: 'Posnet' },
  { value: 'efectivo', icon: Banknote, hint: 'Cálculo de vuelto' },
  { value: 'transferencia', icon: Landmark, hint: 'Alias / CBU' },
];

const pesos = z.coerce.number({ message: 'Importe inválido' }).min(0, 'No puede ser negativo');

// ------------------------------------------------------------------ Apertura / arqueo / cierre
function CashModal({ open, onClose, cash }) {
  const current = cash?.data?.cash;
  const schema = z.object({ amount: pesos, notes: z.string().max(300).optional() });
  const { register, handleSubmit, formState, reset } = useForm({ resolver: zodResolver(schema), defaultValues: { amount: '', notes: '' } });
  const [report, setReport] = useState(null);

  const onSubmit = handleSubmit(async ({ amount, notes }) => {
    try {
      if (current) {
        const ok = await notify.confirm({ title: '¿Cerrar la caja?', text: 'Se emite el reporte de cierre (Z) del turno.', confirmText: 'Cerrar caja', danger: true });
        if (!ok) return;
        const r = await api.post('/billing/cash/close', { countedCash: Math.round(amount * 100), notes });
        setReport(r.report);
      } else {
        await api.post('/billing/cash/open', { openingAmount: Math.round(amount * 100) });
        notify.toast('Caja abierta');
        onClose();
      }
      reset();
      cash.reload({ silent: true });
    } catch (err) {
      notify.error(err);
    }
  });

  return (
    <Modal open={open} onClose={() => { setReport(null); onClose(); }} title={report ? 'Reporte de cierre (Z)' : current ? 'Arqueo y cierre de caja' : 'Apertura de caja'} size="sm">
      {report ? (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt>Caja</dt><dd className="text-right font-semibold">#{report.id}</dd>
          <dt>Ventas</dt><dd className="text-right font-semibold">{money(report.totals.amount)}</dd>
          <dt>Propinas</dt><dd className="text-right">{money(report.totals.tips)}</dd>
          <dt>Comprobantes</dt><dd className="text-right">{report.tickets}</dd>
          <dt>Efectivo esperado</dt><dd className="text-right">{money(report.expected_cash)}</dd>
          <dt>Efectivo contado</dt><dd className="text-right">{money(report.counted_cash)}</dd>
          <dt className="font-bold">Diferencia</dt>
          <dd className={cx('text-right font-bold', report.difference === 0 ? 'text-tertiary' : 'text-error')}>{money(report.difference)}</dd>
        </dl>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {current && (
            <dl className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-container p-4 text-sm">
              <dt>Fondo inicial</dt><dd className="text-right">{money(current.opening_amount)}</dd>
              {current.by_method.map((m) => (
                <div key={m.method} className="contents">
                  <dt>{PAYMENT_LABELS[m.method]} ({m.count})</dt>
                  <dd className="text-right">{money(m.amount)}</dd>
                </div>
              ))}
              <dt className="font-bold">Efectivo esperado</dt><dd className="text-right font-bold">{money(current.expected_cash)}</dd>
            </dl>
          )}
          <Input label={current ? 'Efectivo contado en caja ($)' : 'Fondo fijo inicial ($)'} type="number" inputMode="decimal" step="0.01" error={formState.errors.amount} {...register('amount')} />
          {current && <Input label="Observaciones" {...register('notes')} />}
          <Button type="submit" variant={current ? 'danger' : 'primary'} icon={current ? Lock : LockOpen} loading={formState.isSubmitting}>
            {current ? 'Cerrar caja' : 'Abrir caja'}
          </Button>
        </form>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ Panel de cobro
const receiverSchema = z
  .object({
    iva_condition: z.enum(['consumidor_final', 'responsable_inscripto', 'monotributo', 'exento']),
    doc_number: z.string().trim().max(13),
    name: z.string().trim().max(120),
  })
  .refine((r) => r.iva_condition === 'consumidor_final' || /^\d{2}-?\d{8}-?\d$/.test(r.doc_number), { message: 'CUIT inválido', path: ['doc_number'] })
  .refine((r) => r.iva_condition === 'consumidor_final' || r.name.length > 1, { message: 'Ingresá la razón social', path: ['name'] });

function ChargePanel({ sessionId, cashOpen, onClosed }) {
  const { can } = useAuth();
  const { settings } = useFloor();
  const [, navigate] = useLocation();
  const bill = useAsync(() => api.get(`/billing/sessions/${sessionId}`).then((r) => r.bill), [sessionId]);
  useRealtimeEvent(['tables.changed', 'item.updated', 'order.created'], () => bill.reload({ silent: true }));
  const [mode, setMode] = useState('full');
  const [parts, setParts] = useState(2);
  const [picked, setPicked] = useState([]);
  const [method, setMethod] = useState('qr');
  const [closing, setClosing] = useState(false);

  const payForm = useForm({
    resolver: zodResolver(z.object({ amount: pesos.refine((v) => v > 0, 'Ingresá un importe'), tip: pesos, received: z.union([z.string(), z.number()]).optional(), reference: z.string().max(60) })),
    defaultValues: { amount: '', tip: 0, received: '', reference: '' },
  });
  const receiverForm = useForm({ resolver: zodResolver(receiverSchema), defaultValues: { iva_condition: 'consumidor_final', doc_number: '', name: '' } });
  const [amount, tip, received] = useWatch({ control: payForm.control, name: ['amount', 'tip', 'received'] });
  const ivaCondition = useWatch({ control: receiverForm.control, name: 'iva_condition' });

  const b = bill.data;
  const balance = b?.balance ?? 0;

  // Sugerencia de importe según la estrategia de división elegida (calculada en el servidor).
  useEffect(() => {
    if (!b || balance <= 0) return;
    if (mode === 'items' && !picked.length) return;
    api
      .post(`/billing/sessions/${sessionId}/quote`, { mode, parts, itemIds: picked })
      .then((q) => payForm.setValue('amount', toPesos(q.amount)))
      .catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, parts, picked.join(','), balance, sessionId]);

  if (!b) return <Spinner />;

  const due = toCents(amount || 0) + toCents(tip || 0);
  const change = method === 'efectivo' && received !== '' && received != null ? toCents(received) - due : null;

  const pay = payForm.handleSubmit(async (d) => {
    try {
      const r = await api.post(`/billing/sessions/${sessionId}/payments`, {
        method,
        amount: toCents(d.amount),
        tip: toCents(d.tip || 0),
        received: method === 'efectivo' && d.received !== '' && d.received != null ? toCents(d.received) : undefined,
        reference: d.reference || undefined,
      });
      notify.toast(r.change ? `Pago registrado · Vuelto ${money(r.change)}` : 'Pago registrado');
      payForm.reset({ amount: '', tip: 0, received: '', reference: '' });
      setPicked([]);
      bill.reload({ silent: true });
    } catch (err) {
      notify.error(err);
    }
  });

  const close = receiverForm.handleSubmit(async (receiver) => {
    setClosing(true);
    try {
      const { ticket } = await api.post(`/billing/sessions/${sessionId}/close`, { receiver });
      notify.toast('Cuenta cerrada y mesa liberada');
      onClosed();
      navigate(`/ticket/${ticket.id}`);
    } catch (err) {
      notify.error(err);
    } finally {
      setClosing(false);
    }
  });

  async function precuenta() {
    try {
      const { ticket } = await api.post(`/billing/sessions/${sessionId}/precuenta`);
      navigate(`/ticket/${ticket.id}`);
    } catch (err) {
      notify.error(err);
    }
  }

  async function discount() {
    const pct = await notify.prompt({ title: 'Descuento o invitación', label: 'Porcentaje (100 = invitación de la casa)', input: 'number', inputValue: String(b.discountPct || ''), validator: (v) => (v === '' || v < 0 || v > 100 ? 'Entre 0 y 100' : undefined) });
    if (pct === null) return;
    const reason = await notify.prompt({ title: 'Motivo', label: 'Queda registrado en auditoría', validator: (v) => (!v ? 'Indicá el motivo' : undefined) });
    if (reason === null) return;
    try {
      await api.post(`/billing/sessions/${sessionId}/discount`, { percent: Number(pct), reason });
      bill.reload({ silent: true });
    } catch (err) {
      notify.error(err);
    }
  }

  const suggestedTip = Math.round((balance * (settings?.suggested_tip ?? 0)) / 100 / 100);

  return (
    <div className="flex flex-col gap-5">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-14 place-items-center rounded-full bg-primary-container font-headline text-headline-md font-bold text-white">{b.context.tables[0]}</span>
            <div>
              <h2 className="font-headline text-headline-md font-bold">Mesa {b.context.tables.join(' + ')}</h2>
              <p className="text-label text-on-surface-variant">Apertura {hhmm(b.context.opened_at)} · Mozo: {b.context.waiter ?? 'sin asignar'} · {b.guests} comensales · Comanda #{b.sessionId}</p>
            </div>
          </div>
          <Button variant="muted" size="sm" icon={Printer} onClick={precuenta} disabled={!b.items.length}>Pre-cuenta</Button>
        </div>

        <p className="label-caps mt-5 mb-2">Modo de división de cuenta</p>
        <Tabs value={mode} onChange={setMode} tabs={[{ value: 'full', label: 'Cuenta única' }, { value: 'equal', label: 'Partes iguales' }, { value: 'items', label: 'Ítem por ítem' }]} />
        {mode === 'equal' && (
          <div className="mt-3 flex items-center gap-3 text-sm">
            <Split className="size-5 text-primary" aria-hidden="true" /> Dividir en
            <QuantityStepper size="sm" value={parts} onChange={setParts} min={2} max={60} />
            partes de {money(Math.ceil(b.total / parts / 100) * 100)}
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="label-caps text-left">
                {mode === 'items' && <th className="w-8 py-2"><span className="sr-only">Seleccionar</span></th>}
                <th className="py-2">Artículo</th>
                <th className="py-2 text-center">Cant.</th>
                <th className="py-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {b.items.map((i) => (
                <tr key={i.id}>
                  {mode === 'items' && (
                    <td className="py-2">
                      <input type="checkbox" aria-label={`Incluir ${i.name}`} className="size-5 accent-primary-container" checked={picked.includes(i.id)} onChange={() => setPicked((p) => (p.includes(i.id) ? p.filter((x) => x !== i.id) : [...p, i.id]))} />
                    </td>
                  )}
                  <td className="py-2">
                    <span className="font-semibold">{i.name}</span>
                    {i.modifiers.length > 0 && <span className="block text-label text-on-surface-variant">{i.modifiers.map((m) => m.name).join(' · ')}</span>}
                  </td>
                  <td className="py-2 text-center">{i.quantity}</td>
                  <td className="py-2 text-right font-semibold">{money(i.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="mt-4 flex flex-col gap-1 rounded-2xl bg-surface-container p-4 text-sm">
          <div className="flex justify-between"><dt>Subtotal consumos</dt><dd>{money(b.subtotal)}</dd></div>
          {b.discount > 0 && <div className="flex justify-between text-tertiary"><dt>Descuento {b.discountPct}% {b.discountReason ? `(${b.discountReason})` : ''}</dt><dd>-{money(b.discount)}</dd></div>}
          <div className="flex justify-between text-on-surface-variant"><dt>IVA contenido</dt><dd>{money(b.vatTotal)}</dd></div>
          {b.paid > 0 && <div className="flex justify-between"><dt>Pagado ({b.payments.length})</dt><dd>-{money(b.paid)}</dd></div>}
          {suggestedTip > 0 && <div className="flex justify-between text-on-surface-variant"><dt>Propina sugerida ({settings.suggested_tip}%)</dt><dd>{money(suggestedTip * 100)}</dd></div>}
          <div className="mt-2 flex items-end justify-between border-t border-outline-variant/40 pt-2">
            <dt className="font-headline text-headline-sm font-bold">Saldo a cobrar</dt>
            <dd className="font-headline text-display font-bold text-primary">{money(balance)}</dd>
          </div>
        </dl>
      </section>

      {balance > 0 && can('caja.cobrar') && (
        <section className="card flex flex-col gap-4 p-5" aria-labelledby="medio">
          <h3 id="medio" className="label-caps">Medio de pago</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {METHODS.map(({ value, icon: Icon, hint }) => (
              <button key={value} type="button" aria-pressed={method === value} onClick={() => setMethod(value)} className={cx('flex flex-col items-center gap-1 rounded-2xl border-2 p-3 text-center', method === value ? 'border-primary-container bg-primary-fixed/40' : 'border-transparent bg-surface-low')}>
                <Icon className="size-6 text-primary" aria-hidden="true" />
                <span className="text-sm font-semibold">{PAYMENT_LABELS[value]}</span>
                <span className="text-micro text-on-surface-variant">{hint}</span>
              </button>
            ))}
          </div>
          {!cashOpen && <p className="rounded-2xl bg-error-container p-3 text-sm text-on-error-container">La caja está cerrada. Abrila para registrar cobros.</p>}
          <form onSubmit={pay} noValidate className="grid gap-3 sm:grid-cols-2">
            <Input label="Importe a cobrar ($)" type="number" inputMode="decimal" step="0.01" error={payForm.formState.errors.amount} {...payForm.register('amount')} />
            <Input label="Propina ($)" type="number" inputMode="decimal" step="0.01" hint="Voluntaria, no integra el comprobante" error={payForm.formState.errors.tip} {...payForm.register('tip')} />
            {method === 'efectivo' ? (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Input label="Efectivo recibido ($)" type="number" inputMode="decimal" step="0.01" error={payForm.formState.errors.received} {...payForm.register('received')} />
                <div className="flex flex-wrap gap-2">
                  {[1000, 5000, 10000, 20000].map((round) => {
                    const v = Math.ceil(due / 100 / round) * round;
                    return (
                      <button key={round} type="button" className="rounded-full bg-surface-container px-3 py-1 text-label font-semibold" onClick={() => payForm.setValue('received', v)}>
                        {money(v * 100)}
                      </button>
                    );
                  })}
                </div>
                <p className={cx('flex items-center justify-between rounded-2xl p-3 font-semibold', change == null ? 'bg-surface-low' : change >= 0 ? 'bg-tertiary-fixed/40 text-tertiary' : 'bg-error-container text-on-error-container')}>
                  <span className="flex items-center gap-2"><Calculator className="size-5" aria-hidden="true" /> Vuelto a entregar</span>
                  <span className="font-headline text-headline-sm">{change == null ? '—' : change >= 0 ? money(change) : `Faltan ${money(-change)}`}</span>
                </p>
              </div>
            ) : (
              <Input label="N.º de operación (opcional)" className="sm:col-span-2" {...payForm.register('reference')} />
            )}
            <Button type="submit" size="lg" className="sm:col-span-2" icon={CheckCircle2} disabled={!cashOpen} loading={payForm.formState.isSubmitting}>
              Registrar pago {due > 0 ? `· ${money(due)}` : ''}
            </Button>
          </form>
        </section>
      )}

      {b.payments.length > 0 && (
        <section className="card p-5">
          <h3 className="label-caps mb-2">Pagos registrados</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {b.payments.map((p) => (
              <li key={p.id} className="flex justify-between rounded-2xl bg-surface-low px-3 py-2">
                <span>{PAYMENT_LABELS[p.method]} · {hhmm(p.created_at)}{p.change_given ? ` · vuelto ${money(p.change_given)}` : ''}</span>
                <span className="font-semibold">{money(p.amount)}{p.tip ? ` + ${money(p.tip)} propina` : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card flex flex-col gap-4 p-5" aria-labelledby="fiscal">
        <h3 id="fiscal" className="label-caps flex items-center gap-2"><ReceiptText className="size-4" aria-hidden="true" /> Datos del comprobante</h3>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {Object.entries(IVA_LABELS).map(([k, label]) => (
            <label key={k} className={cx('flex cursor-pointer items-center gap-2 rounded-2xl border-2 p-3 text-sm font-semibold', ivaCondition === k ? 'border-primary-container bg-primary-fixed/30' : 'border-transparent bg-surface-low')}>
              <input type="radio" value={k} className="accent-primary-container" {...receiverForm.register('iva_condition')} />
              {label}
            </label>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={ivaCondition === 'consumidor_final' ? 'DNI / CUIL (opcional)' : 'CUIT'} inputMode="numeric" error={receiverForm.formState.errors.doc_number} {...receiverForm.register('doc_number')} />
          <Input label={ivaCondition === 'consumidor_final' ? 'Nombre (opcional)' : 'Razón social'} error={receiverForm.formState.errors.name} {...receiverForm.register('name')} />
        </div>
        <div className="flex flex-wrap gap-2">
          {can('caja.descuentos') && <Button variant="muted" icon={Percent} onClick={discount} disabled={b.paid > 0}>Descuento / invitación</Button>}
          {can('caja.cobrar') && (
            <Button size="lg" icon={CheckCircle2} className="ml-auto" disabled={balance > 0 || !b.items.length} loading={closing} onClick={close}>
              Cobrar y liberar mesa
            </Button>
          )}
        </div>
        {balance > 0 && <p className="text-label text-on-surface-variant">Registrá los pagos hasta saldar la cuenta para emitir el comprobante final.</p>}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ Página
export default function CashierPage() {
  const { can } = useAuth();
  const { data: floor, reload: reloadFloor } = useFloor();
  const cash = useCash();
  const search = useSearch();
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState('all');
  const [cashModal, setCashModal] = useState(false);
  const tickets = useAsync(() => api.get('/billing/tickets').then((r) => r.tickets), []);
  useRealtimeEvent(['session.closed'], () => tickets.reload({ silent: true }));
  const selectedId = Number(new URLSearchParams(search).get('sesion')) || null;

  if (!floor || !cash.data) return <Spinner />;
  const c = cash.data.cash;
  const sessions = floor.sessions.filter((s) => s.items_count > 0 || s.total > 0);
  const calls = floor.calls;
  const billCall = (s) => calls.find((x) => x.type === 'cuenta' && s.tables.some((t) => t.id === x.table_id));
  const list = sessions.filter((s) => filter === 'all' || (filter === 'billing' ? s.status === 'billing' || billCall(s) : s.status === 'open' && !billCall(s)));
  const pending = sessions.reduce((sum, s) => sum + s.balance, 0);
  const digital = c ? c.by_method.filter((m) => m.method !== 'efectivo').reduce((s, m) => s + m.amount, 0) : 0;
  const select = (id) => navigate(id ? `/caja?sesion=${id}` : '/caja', { replace: true });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={c ? `Caja #${c.id} abierta por ${c.opened_by_name}` : 'Caja cerrada'}
        title="Caja & cuentas"
        actions={
          can('caja.abrir_cerrar') && (
            <Button variant={c ? 'dark' : 'primary'} icon={c ? Lock : LockOpen} onClick={() => setCashModal(true)}>
              {c ? 'Arqueo / cierre de caja' : 'Abrir caja'}
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Facturado turno" value={money(c?.totals.amount)} hint={`${c?.tickets ?? 0} comprobantes`} icon={TrendingUp} />
        <StatCard label="Por cobrar" value={money(pending)} hint={`${sessions.length} mesas`} icon={ReceiptText} tone={pending ? 'honey' : 'neutral'} />
        <StatCard label="Ticket promedio" value={money(c?.average_ticket)} icon={ListChecks} />
        <StatCard label="Efectivo en caja" value={money(c?.expected_cash)} hint={c ? `Fondo fijo ${money(c.opening_amount)}` : undefined} icon={Banknote} />
        <StatCard label="Digital / tarjetas" value={money(digital)} hint={c?.totals.amount ? `${Math.round((digital / c.totals.amount) * 100)}% del total` : undefined} icon={QrCode} tone="sage" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[22rem_1fr]">
        <section className="card flex h-fit flex-col gap-3 p-4" aria-labelledby="mesas">
          <h2 id="mesas" className="flex items-center gap-2 font-headline text-headline-sm font-bold"><Wallet className="size-5 text-primary" aria-hidden="true" /> Mesas & comandas</h2>
          <Tabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { value: 'all', label: 'Todas', count: sessions.length },
              { value: 'billing', label: 'Piden cuenta', count: sessions.filter((s) => s.status === 'billing' || billCall(s)).length },
              { value: 'open', label: 'En consumo' },
            ]}
          />
          {list.length === 0 && <EmptyState icon={Wallet} title="Sin cuentas pendientes" />}
          <ul className="flex flex-col gap-2">
            {list.map((s) => {
              const call = billCall(s);
              const detail = call?.detail ? JSON.parse(call.detail) : null;
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => select(s.id)} aria-pressed={s.id === selectedId} className={cx('flex w-full flex-col gap-1 rounded-2xl border-2 p-3 text-left transition', s.id === selectedId ? 'border-primary-container bg-primary-fixed/30' : 'border-transparent bg-surface-low hover:bg-surface-container')}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-headline text-headline-sm font-bold">Mesa {tablesLabel(s)}</span>
                      <span className="font-bold text-primary">{money(s.balance)}</span>
                    </span>
                    <span className="text-label text-on-surface-variant">
                      {s.guests} comensales · {s.waiter_name ?? 'Sin mozo'} · hace {minutesSince(s.opened_at)} min
                    </span>
                    {(call || s.status === 'billing') && (
                      <span className="flex items-center gap-1 text-label font-semibold text-secondary">
                        <BellRing className="size-3.5" aria-hidden="true" /> Pide cuenta{detail?.method ? ` · ${PAYMENT_LABELS[detail.method]}` : ''}{detail?.tip_pct != null ? ` · propina ${detail.tip_pct}%` : ''}{detail?.split ? ` · ${detail.split}` : ''}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="min-w-0">
          {selectedId ? (
            <ChargePanel
              key={selectedId}
              sessionId={selectedId}
              cashOpen={!!c}
              onClosed={() => {
                reloadFloor({ silent: true });
                cash.reload({ silent: true });
              }}
            />
          ) : (
            <EmptyState icon={ReceiptText} title="Elegí una mesa para cobrar" text="Vas a poder dividir la cuenta, registrar pagos y emitir el comprobante." />
          )}
        </div>
      </div>

      <section className="card p-5" aria-labelledby="tk">
        <h2 id="tk" className="label-caps mb-3">Últimos comprobantes</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="label-caps text-left"><th className="py-2">Tipo</th><th>Número</th><th>Fecha</th><th>Emitió</th><th className="text-right">Total</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {(tickets.data ?? []).map((t) => (
                <tr key={t.id}>
                  <td className="py-2"><Badge tone={t.kind === 'precuenta' ? 'neutral' : 'primary'}>{t.kind === 'precuenta' ? 'Pre-cuenta' : `Comprobante ${t.letter}`}</Badge></td>
                  <td className="font-mono">{String(t.pos_number).padStart(5, '0')}-{String(t.number).padStart(8, '0')}</td>
                  <td>{new Date(t.issued_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>{t.issued_by_name}</td>
                  <td className="text-right font-semibold">{money(t.total)}</td>
                  <td className="text-right"><Button size="sm" variant="ghost" icon={Printer} onClick={() => navigate(`/ticket/${t.id}`)}>Reimprimir</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <CashModal open={cashModal} onClose={() => setCashModal(false)} cash={cash} />
    </div>
  );
}
