import { useState } from 'react';
import { Banknote, CheckCircle2, CreditCard, Landmark, QrCode, ReceiptText, Split, UsersRound } from 'lucide-react';
import { money } from '../../lib/format.js';
import { PAYMENT_LABELS } from '../../lib/legal.js';
import { notify } from '../../lib/notify.js';
import { useAsync, usePolling } from '../../lib/hooks.js';
import { Button, EmptyState, QuantityStepper, Spinner, Tabs, cx } from '../../ui/index.jsx';
import { scannerActions, tableApi, useMenu, useTable } from '../store.js';

const METHODS = [
  { value: 'qr', icon: QrCode, hint: 'Mercado Pago, MODO y billeteras' },
  { value: 'debito', icon: CreditCard, hint: 'Posnet en la mesa' },
  { value: 'credito', icon: CreditCard, hint: 'Posnet en la mesa' },
  { value: 'efectivo', icon: Banknote, hint: 'Te traemos el cambio' },
  { value: 'transferencia', icon: Landmark, hint: 'Alias o CBU' },
];

export default function BillPage() {
  const { pass: token } = useTable();
  const { data: menu } = useMenu();
  const order = useAsync(() => (token ? tableApi.get('/order') : Promise.resolve(null)), [token]);
  usePolling(() => order.reload({ silent: true }), 20_000, !!token);
  const [mode, setMode] = useState('equal');
  const [parts, setParts] = useState(2);
  const [picked, setPicked] = useState([]);
  const [tipPct, setTipPct] = useState(null);
  const [method, setMethod] = useState('qr');
  const [sending, setSending] = useState(false);

  if (!token)
    return (
      <EmptyState
        icon={QrCode}
        title="Escaneá el QR de tu mesa"
        text="Para ver y pedir tu cuenta necesitamos saber en qué mesa estás."
        action={<Button icon={QrCode} onClick={() => scannerActions.open('Escaneá el QR de tu mesa para ver tu cuenta.')}>Escanear QR de la mesa</Button>}
      />
    );
  if (order.loading && !order.data) return <Spinner />;
  if (!order.data?.session) return <EmptyState icon={ReceiptText} title="Tu mesa no tiene una cuenta abierta" text="Cuando el mozo abra la mesa vas a ver acá el detalle." />;

  const { items, totals, pending_calls: calls } = order.data;
  const valid = items.filter((i) => i.status !== 'anulado');
  const tipOptions = menu?.settings.tip_options ?? [];
  const tip = tipPct ?? menu?.settings.suggested_tip ?? 0;
  const pickedTotal = valid.filter((i) => picked.includes(i.id)).reduce((s, i) => s + i.line_total, 0);
  const share = mode === 'equal' ? Math.ceil(totals.balance / parts / 100) * 100 : mode === 'items' ? pickedTotal : totals.balance;
  const tipAmount = Math.round((share * tip) / 100 / 100) * 100;
  const billRequested = calls.some((c) => c.type === 'cuenta');

  async function requestBill() {
    setSending(true);
    try {
      const split = mode === 'equal' ? `${parts} partes iguales` : mode === 'items' ? `por consumo: ${money(pickedTotal)}` : 'cuenta única';
      await tableApi.post('/calls', { type: 'cuenta', detail: { method, tip_pct: tip, split } });
      notify.success('¡Cuenta solicitada!', `El mozo se acerca con ${method === 'qr' ? 'el QR de pago' : method === 'efectivo' ? 'la cuenta' : 'el posnet'}.`);
      order.reload({ silent: true });
    } catch (err) {
      notify.error(err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start">
      <section className="card flex flex-col gap-3 p-5" aria-labelledby="resumen">
        <h1 id="resumen" className="flex items-center justify-between font-headline text-headline-md font-bold">
          Resumen de cuenta <ReceiptText className="size-6 text-on-surface-variant" aria-hidden="true" />
        </h1>
        <ul className="flex flex-col gap-2 text-sm">
          {valid.map((i) => (
            <li key={i.id} className="flex justify-between gap-3">
              <span>{i.quantity}x {i.name}</span>
              <span className="font-semibold">{money(i.line_total)}</span>
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-1.5 border-t border-outline-variant/40 pt-3 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(totals.subtotal)}</dd></div>
          {totals.discount > 0 && <div className="flex justify-between text-tertiary"><dt>Descuento</dt><dd>-{money(totals.discount)}</dd></div>}
          {totals.paid > 0 && <div className="flex justify-between"><dt>Ya pagado</dt><dd>-{money(totals.paid)}</dd></div>}
        </dl>
        <div className="flex items-end justify-between rounded-2xl bg-surface-container p-4">
          <span>
            <span className="label-caps block">Total mesa</span>
            <span className="text-micro text-on-surface-variant">IVA incluido · IVA contenido {money(totals.vat_contained)} (Ley 27.743)</span>
          </span>
          <span className="font-headline text-display font-bold">{money(totals.balance)}</span>
        </div>
      </section>

      <div className="flex flex-col gap-5">
        <section className="card flex flex-col gap-4 p-5" aria-labelledby="dividir">
          <h2 id="dividir" className="flex items-center gap-2 font-headline text-headline-sm font-bold">
            <Split className="size-5 text-primary" aria-hidden="true" /> Dividir la cuenta
          </h2>
          <Tabs value={mode} onChange={setMode} tabs={[{ value: 'equal', label: 'Partes iguales' }, { value: 'items', label: 'Por consumo' }, { value: 'full', label: 'Cuenta única' }]} />
          {mode === 'equal' && (
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold"><UsersRound className="size-5" aria-hidden="true" /> ¿Entre cuántos?</span>
              <QuantityStepper value={parts} onChange={setParts} min={2} max={30} />
            </div>
          )}
          {mode === 'items' && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm text-on-surface-variant">Marcá lo que consumiste vos</legend>
              {valid.map((i) => (
                <label key={i.id} className="flex items-center gap-3 rounded-2xl bg-surface-low p-3 text-sm">
                  <input type="checkbox" className="size-5 accent-primary-container" checked={picked.includes(i.id)} onChange={() => setPicked((p) => (p.includes(i.id) ? p.filter((x) => x !== i.id) : [...p, i.id]))} />
                  <span className="flex-1">{i.quantity}x {i.name}</span>
                  <span className="font-semibold">{money(i.line_total)}</span>
                </label>
              ))}
            </fieldset>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold">Propina para el equipo de salón <span className="font-normal text-on-surface-variant">(voluntaria)</span></p>
            <div className="grid grid-cols-4 gap-2">
              {tipOptions.map((t) => (
                <button key={t} type="button" aria-pressed={tip === t} onClick={() => setTipPct(t)} className={cx('h-10 rounded-full text-sm font-semibold', tip === t ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container')}>
                  {t}%
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-primary-fixed/50 px-4 py-3">
            <span className="text-sm font-semibold">{mode === 'equal' ? 'Cada uno paga' : 'Te toca pagar'}{tipAmount > 0 && ' (con propina)'}</span>
            <span className="font-headline text-headline-md font-bold text-primary">{money(share + tipAmount)}</span>
          </div>
        </section>

        <section className="card flex flex-col gap-3 p-5" aria-labelledby="pago">
          <h2 id="pago" className="label-caps">Forma de pago</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {METHODS.map(({ value, icon: Icon, hint }) => (
              <label key={value} className={cx('flex cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] p-3', method === value ? 'border-primary-container bg-primary-fixed/30' : 'border-transparent bg-surface-low')}>
                <input type="radio" name="metodo" value={value} checked={method === value} onChange={() => setMethod(value)} className="sr-only" />
                <Icon className="size-6 text-primary" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-semibold">{PAYMENT_LABELS[value]}</span>
                  <span className="block text-micro text-on-surface-variant">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          {billRequested ? (
            <p className="flex items-center gap-2 rounded-2xl bg-tertiary-fixed/40 p-4 text-sm font-semibold text-tertiary" role="status">
              <CheckCircle2 className="size-5" aria-hidden="true" /> Cuenta solicitada. El mozo ya está en camino.
            </p>
          ) : (
            <Button size="lg" icon={ReceiptText} loading={sending} disabled={mode === 'items' && !picked.length} onClick={requestBill}>
              Pedir la cuenta
            </Button>
          )}
          <p className="text-micro text-on-surface-variant">El comprobante se emite al cerrar la mesa. Si necesitás Factura A, indicale tu CUIT al mozo.</p>
        </section>
      </div>
    </div>
  );
}
