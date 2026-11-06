import { useDeferredValue, useMemo, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { ArrowLeft, Minus, Plus, Search, Send, ShoppingBag, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { money } from '../../lib/format.js';
import { notify } from '../../lib/notify.js';
import { useAsync } from '../../lib/hooks.js';
import { CategoryIcon } from '../../lib/icons.jsx';
import { Button, Chip, EmptyState, IconButton, Input, Modal, PageHeader, QuantityStepper, Select, Spinner, cx } from '../../ui/index.jsx';
import DishImage from '../../shared/DishImage.jsx';
import ModifierForm, { useModifierForm } from '../../shared/ModifierForm.jsx';
import { useFloor, tablesLabel } from '../staffData.jsx';

function ProductModal({ product, onAdd, onClose }) {
  const [qty, setQty] = useState(1);
  const { form, selected, unitPrice } = useModifierForm(product);
  const submit = form.handleSubmit(({ notes }) => {
    const names = product.modifier_groups.flatMap((g) => g.options).filter((o) => selected.includes(o.id)).map((o) => o.name);
    onAdd({ product_id: product.id, name: product.name, unit_price: unitPrice, quantity: qty, modifiers: selected, modifierNames: names, notes: notes.trim() });
  });
  return (
    <Modal open onClose={onClose} title={product.name} footer={
      <>
        <QuantityStepper value={qty} onChange={setQty} />
        <Button icon={Plus} onClick={submit}>Agregar · {money(unitPrice * qty)}</Button>
      </>
    }>
      <form onSubmit={submit}><ModifierForm product={product} form={form} /></form>
    </Modal>
  );
}

function TablePicker({ onPicked }) {
  const { data, reload } = useFloor();
  const [tableId, setTableId] = useState('');
  const [guests, setGuests] = useState(2);
  if (!data) return <Spinner />;
  const free = data.tables.filter((t) => !t.session_id);
  const sectorName = (id) => data.sectors.find((s) => s.id === id)?.name;
  async function open() {
    try {
      const { sessionId } = await api.post(`/floor/tables/${tableId}/open`, { guests });
      reload({ silent: true });
      onPicked(sessionId);
    } catch (err) {
      notify.error(err);
    }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card p-5">
        <h2 className="mb-3 font-headline text-headline-sm font-bold">Mesas abiertas</h2>
        {data.sessions.length === 0 && <p className="text-sm text-on-surface-variant">No hay mesas abiertas.</p>}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {data.sessions.map((s) => (
            <button key={s.id} type="button" onClick={() => onPicked(s.id)} className="flex flex-col items-center rounded-2xl bg-primary-fixed/40 p-3 hover:bg-primary-fixed">
              <span className="font-headline text-headline-md font-bold">{tablesLabel(s)}</span>
              <span className="text-micro text-on-surface-variant">{s.guests} pax · {money(s.total)}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="card flex flex-col gap-3 p-5">
        <h2 className="font-headline text-headline-sm font-bold">Abrir mesa libre</h2>
        <Select label="Mesa" value={tableId} onChange={(e) => setTableId(e.target.value)}>
          <option value="">Elegí una mesa</option>
          {free.map((t) => <option key={t.id} value={t.id}>Mesa {t.number} · {sectorName(t.sector_id)} ({t.seats} sillas)</option>)}
        </Select>
        <div className="flex items-center justify-between"><span className="text-sm font-semibold">Comensales</span><QuantityStepper value={guests} onChange={setGuests} max={60} /></div>
        <Button icon={Plus} disabled={!tableId} onClick={open}>Abrir y tomar pedido</Button>
      </section>
    </div>
  );
}

export default function NewOrderPage() {
  const { sessionId } = useParams();
  const [, navigate] = useLocation();
  const { data: floor } = useFloor();
  const catalog = useAsync(() => api.get('/menu'), []);
  const [category, setCategory] = useState(null);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null);
  const [cart, setCart] = useState([]);
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const q = useDeferredValue(query);

  const products = useMemo(
    () => (catalog.data?.products ?? []).filter((p) => p.available).map((p) => ({ ...p, final_price: p.finalPrice })),
    [catalog.data],
  );
  const filtered = products.filter((p) => (!category || p.category_id === category) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));

  if (!sessionId) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader eyebrow="Nuevo pedido" title="¿Para qué mesa?" />
        <TablePicker onPicked={(id) => navigate(`/pedido/${id}`, { replace: true })} />
      </div>
    );
  }
  if (!catalog.data || !floor) return <Spinner />;
  const session = floor.sessions.find((s) => s.id === Number(sessionId));
  if (!session) return <EmptyState icon={ShoppingBag} title="La cuenta ya no está abierta" action={<Button onClick={() => navigate('/pedido')}>Elegir otra mesa</Button>} />;

  const add = (line) => {
    const key = `${line.product_id}|${line.modifiers.join(',')}|${line.notes}`;
    setCart((c) => (c.some((x) => x.key === key) ? c.map((x) => (x.key === key ? { ...x, quantity: x.quantity + line.quantity } : x)) : [...c, { ...line, key }]));
    setModal(null);
  };
  const total = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);

  async function send() {
    setSending(true);
    try {
      await api.post(`/orders/sessions/${sessionId}`, { notes: notes || undefined, items: cart.map(({ product_id, quantity, modifiers, notes: n }) => ({ product_id, quantity, modifiers, notes: n })) });
      notify.toast('Pedido enviado a cocina');
      navigate('/salon');
    } catch (err) {
      notify.error(err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <IconButton label="Volver" icon={ArrowLeft} onClick={() => history.back()} />
        <PageHeader eyebrow={`Comanda #${session.id} · ${session.guests} comensales`} title={`Pedido · Mesa ${tablesLabel(session)}`} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <section className="flex min-w-0 flex-col gap-4">
          <label className="relative">
            <span className="sr-only">Buscar producto</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-outline" aria-hidden="true" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto…" className="h-12 w-full rounded-full border-[1.5px] border-outline-variant/50 bg-surface-lowest pr-4 pl-12 text-sm outline-none focus:border-primary-container" />
          </label>
          <div className="scrollbar-none flex gap-2 overflow-x-auto">
            <Chip active={!category} onClick={() => setCategory(null)}>Todos</Chip>
            {catalog.data.categories.filter((c) => c.active).map((c) => (
              <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}><CategoryIcon name={c.icon} className="size-4" /> {c.name}</Chip>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => (p.modifier_groups.length ? setModal(p) : add({ product_id: p.id, name: p.name, unit_price: p.final_price, quantity: 1, modifiers: [], modifierNames: [], notes: '' }))}
                className="card flex flex-col overflow-hidden text-left transition hover:shadow-raised active:scale-[0.98]"
              >
                <DishImage product={p} icon={catalog.data.categories.find((c) => c.id === p.category_id)?.icon} className="aspect-[4/3] w-full" sizes="200px" />
                <span className="flex flex-1 flex-col gap-1 p-3">
                  <span className="line-clamp-2 text-sm font-semibold">{p.name}</span>
                  <span className="mt-auto font-bold text-primary">{money(p.final_price)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <aside className="card flex h-fit flex-col gap-3 p-5 xl:sticky xl:top-20" aria-label="Pedido en curso">
          <h2 className="flex items-center gap-2 font-headline text-headline-sm font-bold"><ShoppingBag className="size-5 text-primary" aria-hidden="true" /> Pedido en curso</h2>
          {cart.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Tocá los productos para agregarlos.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {cart.map((i) => (
                <li key={i.key} className="flex items-start gap-2 rounded-2xl bg-surface-low p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{i.name}</p>
                    {i.modifierNames.length > 0 && <p className="text-label text-on-surface-variant">{i.modifierNames.join(' · ')}</p>}
                    {i.notes && <p className="text-label text-primary">“{i.notes}”</p>}
                    <p className="mt-1 text-sm font-bold">{money(i.unit_price * i.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton label="Restar" icon={i.quantity === 1 ? Trash2 : Minus} className="size-8" onClick={() => setCart((c) => c.flatMap((x) => (x.key !== i.key ? [x] : x.quantity > 1 ? [{ ...x, quantity: x.quantity - 1 }] : [])))} />
                    <span className={cx('w-6 text-center font-bold')}>{i.quantity}</span>
                    <IconButton label="Sumar" icon={Plus} className="size-8" onClick={() => setCart((c) => c.map((x) => (x.key === i.key ? { ...x, quantity: x.quantity + 1 } : x)))} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Input label="Nota para cocina (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} />
          <div className="flex items-center justify-between rounded-2xl bg-surface-container px-4 py-3">
            <span className="font-semibold">Total</span>
            <span className="font-headline text-headline-md font-bold text-primary">{money(total)}</span>
          </div>
          <Button size="lg" icon={Send} disabled={!cart.length} loading={sending} onClick={send}>Enviar a cocina</Button>
        </aside>
      </div>
      {modal && <ProductModal product={modal} onAdd={add} onClose={() => setModal(null)} />}
    </div>
  );
}
