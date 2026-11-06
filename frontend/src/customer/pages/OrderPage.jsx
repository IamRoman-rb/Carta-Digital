import { useState } from 'react';
import { Link } from 'wouter';
import { ChefHat, CheckCircle2, CookingPot, QrCode, Send, ShoppingBag, Trash2, UserRound } from 'lucide-react';
import { money, minutesSince } from '../../lib/format.js';
import { ITEM_STATUS } from '../../lib/legal.js';
import { notify } from '../../lib/notify.js';
import { useAsync, usePolling } from '../../lib/hooks.js';
import { Badge, Button, EmptyState, IconButton, QuantityStepper, Textarea, cx } from '../../ui/index.jsx';
import { cartActions, cartTotal, useCart, useTable, tableActions, tableApi } from '../store.js';

const GROUPS = [
  { key: 'cocina', title: 'Marchando en fuegos', icon: CookingPot, statuses: ['pendiente', 'preparando'] },
  { key: 'listo', title: 'Listo para servir', icon: ChefHat, statuses: ['listo'] },
  { key: 'servido', title: 'Entregado en mesa', icon: CheckCircle2, statuses: ['entregado'] },
];

export default function OrderPage() {
  const cart = useCart();
  const { pass: token, info } = useTable();
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const order = useAsync(() => (token ? tableApi.get('/order') : Promise.resolve(null)), [token]);
  usePolling(() => order.reload({ silent: true }), 15_000, !!token);

  const sessionOpen = !!order.data?.session;
  // Sin mesa escaneada el botón abre el escáner; con mesa, solo se habilita si el mozo la abrió.
  const canOrder = !token || (sessionOpen && info?.ordering_enabled !== false);

  async function send() {
    // Paso obligatorio: escanear el QR de la mesa antes de enviar el pedido.
    const table = await tableActions.ensure('Para enviar tu pedido escaneá el QR que está en tu mesa.');
    if (!table) return;
    if (table.ordering_enabled === false) return notify.toast('En esta mesa los pedidos se toman con el mozo', 'info');
    if (!table.session) {
      order.reload({ silent: true });
      return notify.error({ message: `La mesa ${table.table.number} todavía no está habilitada. Pedile al mozo que la abra y vas a poder pedir desde acá.` }, 'Mesa sin habilitar');
    }
    const where = `Mesa ${table.session.tables?.join(' + ') ?? table.table.number}`;
    const ok = await notify.confirm({ title: '¿Enviamos el pedido a la cocina?', text: `${where} · ${cart.length} ${cart.length === 1 ? 'plato' : 'platos'} · ${money(cartTotal(cart))}`, confirmText: 'Enviar pedido' });
    if (!ok) return;
    setSending(true);
    try {
      await tableApi.post('/orders', {
        notes: notes.trim() || undefined,
        items: cart.map((i) => ({ product_id: i.product_id, quantity: i.quantity, modifiers: i.modifiers, notes: i.notes })),
      });
      cartActions.clear();
      setNotes('');
      notify.success('¡Pedido enviado!', 'La cocina ya lo recibió. Podés seguir su estado acá.');
      order.reload({ silent: true });
      tableActions.refresh();
    } catch (err) {
      notify.error(err);
    } finally {
      setSending(false);
    }
  }

  const items = order.data?.items ?? [];

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start">
      <section className="card flex flex-col gap-4 p-5" aria-labelledby="carrito">
        <div className="flex items-center justify-between">
          <h1 id="carrito" className="font-headline text-headline-md font-bold">Tu pedido</h1>
          {cart.length > 0 && <Badge tone="honey">Sin enviar</Badge>}
        </div>

        {cart.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="Todavía no agregaste platos" action={<Link href="/" className="font-semibold text-primary">Ir a la carta</Link>} />
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-outline-variant/30">
              {cart.map((i) => (
                <li key={i.key} className="flex flex-col gap-2 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{i.name}</p>
                      {i.modifierNames?.length > 0 && <p className="text-label text-on-surface-variant">{i.modifierNames.join(' · ')}</p>}
                      {i.notes && <p className="text-label text-primary">Nota: “{i.notes}”</p>}
                    </div>
                    <span className="shrink-0 font-bold">{money(i.unit_price * i.quantity)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <QuantityStepper size="sm" value={i.quantity} onChange={(q) => cartActions.setQuantity(i.key, q)} />
                    <IconButton label={`Quitar ${i.name}`} icon={Trash2} variant="ghost" onClick={() => cartActions.remove(i.key)} />
                  </div>
                </li>
              ))}
            </ul>
            <Textarea label="Comentario general para el mozo (opcional)" value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} placeholder="Ej.: traer todo junto, somos 3" />
            <div className="flex items-center justify-between rounded-2xl bg-surface-container px-4 py-3">
              <span className="font-semibold">Total a enviar</span>
              <span className="font-headline text-headline-md font-bold text-primary">{money(cartTotal(cart))}</span>
            </div>
            {!token && (
              <p className="flex items-start gap-2 rounded-2xl bg-secondary-fixed/70 p-3 text-sm text-on-secondary-container">
                <QrCode className="size-5 shrink-0" aria-hidden="true" /> Antes de enviar vas a escanear el código QR de tu mesa (tiene el número impreso). Así la cocina sabe dónde llevar tu pedido.
              </p>
            )}
            {token && !sessionOpen && !order.loading && (
              <p className="rounded-2xl bg-secondary-fixed/70 p-3 text-sm text-on-secondary-container">Tu mesa todavía no está habilitada. Llamá al mozo para que la abra y vas a poder pedir desde acá.</p>
            )}
            {token && info?.ordering_enabled === false && <p className="rounded-2xl bg-surface-container p-3 text-sm">Los pedidos se toman con el mozo. Mostrale esta lista.</p>}
            <Button size="lg" icon={token ? Send : QrCode} loading={sending} disabled={!canOrder} onClick={send}>
              {token ? 'Enviar a la cocina' : 'Escanear mesa y enviar'}
            </Button>
          </>
        )}
      </section>

      {token && (
        <section className="flex flex-col gap-4" aria-labelledby="estado">
          <div className="card flex items-center justify-between gap-3 p-4">
            <div>
              <h2 id="estado" className="flex items-center gap-2 font-headline text-headline-sm font-bold">
                <span className={cx('size-2.5 rounded-full', sessionOpen ? 'bg-tertiary-container' : 'bg-outline')} aria-hidden="true" />
                Mesa {info?.session?.tables?.join(' + ') ?? info?.table.number} {sessionOpen ? '· En vivo' : ''}
              </h2>
              {info?.session && <p className="text-label text-on-surface-variant">{info.session.guests} comensales · {minutesSince(info.session.opened_at)} min</p>}
            </div>
            {info?.session?.waiter_name && (
              <span className="flex items-center gap-2 rounded-full bg-surface-container px-3 py-1.5 text-label font-semibold">
                <UserRound className="size-4" aria-hidden="true" /> {info.session.waiter_name}
              </span>
            )}
          </div>

          {items.length > 0 ? (
            GROUPS.map((g) => {
              const list = items.filter((i) => g.statuses.includes(i.status));
              if (!list.length) return null;
              return (
                <article key={g.key} className="card p-4">
                  <h3 className="mb-2 flex items-center gap-2 font-semibold">
                    <g.icon className="size-5 text-primary" aria-hidden="true" /> {g.title}
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {list.map((i) => (
                      <li key={i.id} className="flex items-start gap-3 rounded-2xl bg-surface-low p-3">
                        <span className="rounded-lg bg-primary-fixed px-2 py-0.5 text-label font-bold text-primary">{i.quantity}x</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{i.name}</span>
                          {i.modifiers.length > 0 && <span className="block text-label text-on-surface-variant">{i.modifiers.join(' · ')}</span>}
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          <span className="text-sm font-bold">{money(i.line_total)}</span>
                          <span className={cx('rounded-full px-2 py-0.5 text-micro font-bold', ITEM_STATUS[i.status].tone)}>{ITEM_STATUS[i.status].label}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })
          ) : (
            sessionOpen && <EmptyState icon={ChefHat} title="Aún no hay pedidos en cocina" text="Cuando envíes tu pedido vas a ver acá su estado en tiempo real." />
          )}
          {order.data?.totals && order.data.totals.total > 0 && (
            <Link href="/cuenta" className="card flex items-center justify-between p-4 font-semibold">
              Consumido hasta ahora <span className="font-headline text-headline-sm text-primary">{money(order.data.totals.total)}</span>
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
