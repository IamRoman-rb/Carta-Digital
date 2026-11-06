import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { ArrowLeft, Box, Clock, Info, MessageCircleQuestion, ShoppingBag, Sparkles } from 'lucide-react';
import { money } from '../../lib/format.js';
import { ALLERGEN_LABELS, LEGAL, TAG_LABELS } from '../../lib/legal.js';
import { notify } from '../../lib/notify.js';
import { Badge, Button, EmptyState, IconButton, QuantityStepper, Spinner } from '../../ui/index.jsx';
import DishImage from '../../shared/DishImage.jsx';
import ModifierForm, { useModifierForm } from '../../shared/ModifierForm.jsx';
import { cartActions, tableActions, tableApi, useMenu } from '../store.js';
import { Price } from '../components/ProductCard.jsx';

function ProductDetail({ product, icon }) {
  const [, navigate] = useLocation();
  const [qty, setQty] = useState(1);
  const { form, selected, unitPrice } = useModifierForm(product);

  const submit = form.handleSubmit(({ notes }) => {
    const names = product.modifier_groups.flatMap((g) => g.options).filter((o) => selected.includes(o.id)).map((o) => o.name);
    cartActions.add({ product_id: product.id, name: product.name, unit_price: unitPrice, quantity: qty, modifiers: selected, modifierNames: names, notes: notes.trim() });
    notify.toast(`${qty}x ${product.name} agregado`);
    navigate('/');
  });

  async function ask() {
    if (!(await tableActions.ensure('Escaneá el QR de tu mesa para que el mozo sepa adónde ir.'))) return;
    try {
      await tableApi.post('/calls', { type: 'mozo', detail: { reason: `Consulta: ${product.name}`.slice(0, 60) } });
      notify.toast('El mozo se acerca a tu mesa');
    } catch (err) {
      notify.error(err);
    }
  }

  return (
    <form onSubmit={submit} className="-mx-4 -mt-4 flex flex-col lg:mx-0 lg:mt-0 lg:grid lg:grid-cols-2 lg:gap-8">
      <div className="relative lg:sticky lg:top-20 lg:self-start">
        <DishImage product={product} icon={icon} eager className="aspect-[4/3] w-full lg:rounded-card-lg" sizes="(min-width: 1024px) 50vw, 100vw" />
        <IconButton label="Volver" icon={ArrowLeft} onClick={() => history.back()} className="glass absolute top-3 left-3" />
        <div className="absolute top-3 right-3 flex gap-1.5">{product.serves && <Badge className="!bg-surface-lowest/90">{product.serves}</Badge>}</div>
        {product.model && (
          <button type="button" onClick={() => navigate(`/ar/${product.id}`)} className="glass absolute inset-x-3 -bottom-7 flex items-center gap-3 rounded-full p-2 pr-4 text-left shadow-raised lg:bottom-3">
            <span className="grid size-11 place-items-center rounded-full bg-primary-container text-white">
              <Box className="size-5" aria-hidden="true" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-bold">Proyectar en tu mesa</span>
              <span className="block text-micro text-on-surface-variant">Escala 1:1 real · Vista 360°</span>
            </span>
            <Badge tone="honey"><Sparkles className="size-3" aria-hidden="true" /> 3D</Badge>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-5 px-4 pt-12 lg:px-0 lg:pt-0">
        <div>
          <h1 className="font-headline text-headline-lg font-bold tracking-tight">{product.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Price product={product} className="!items-start" />
            {product.prep_minutes > 0 && (
              <Badge><Clock className="size-3.5" aria-hidden="true" /> {product.prep_minutes} min aprox.</Badge>
            )}
            {product.badge && <Badge tone="primary">{product.badge}</Badge>}
            {product.diameter_cm && <Badge>Plato Ø {product.diameter_cm} cm</Badge>}
          </div>
          <p className="mt-3 text-on-surface-variant">{product.description}</p>
          {product.is_combo && product.combo.length > 0 && (
            <p className="mt-2 text-sm"><strong>Incluye:</strong> {product.combo.map((c) => `${c.quantity}x ${c.name}`).join(', ')}</p>
          )}
        </div>

        {(product.allergens.length > 0 || product.tags.length > 0) && (
          <section className="rounded-card bg-surface-container p-4" aria-labelledby="alg">
            <h2 id="alg" className="flex items-center gap-2 text-sm font-bold">
              <Info className="size-5 text-error" aria-hidden="true" /> Alérgenos y características
            </h2>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {product.allergens.map((a) => (
                <li key={a}><Badge className="!bg-surface-lowest">Contiene {ALLERGEN_LABELS[a]}</Badge></li>
              ))}
              {product.tags.map((t) => (
                <li key={t}><Badge tone="sage">{TAG_LABELS[t]}</Badge></li>
              ))}
            </ul>
          </section>
        )}

        <ModifierForm product={product} form={form} />

        {product.is_alcoholic && <p className="rounded-2xl bg-surface-low p-3 text-label text-on-surface-variant">{LEGAL.alcohol}</p>}

        <div className="flex items-center gap-3 rounded-card bg-surface-low p-4">
          <MessageCircleQuestion className="size-6 shrink-0 text-primary" aria-hidden="true" />
          <p className="flex-1 text-sm"><strong className="block">¿Dudas con las porciones?</strong>Consultá a tu mozo.</p>
          <Button type="button" variant="dark" size="sm" onClick={ask}>Preguntar</Button>
        </div>
      </div>

      <div className="glass pb-safe fixed inset-x-0 bottom-16 z-30 border-t border-outline-variant/30">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <QuantityStepper value={qty} onChange={setQty} />
          <Button type="submit" size="lg" icon={ShoppingBag} className="flex-1">
            Agregar · {money(unitPrice * qty)}
          </Button>
        </div>
      </div>
    </form>
  );
}

export default function ProductPage() {
  const { id } = useParams();
  const { data, loading } = useMenu();
  if (loading || !data) return <Spinner />;
  const product = data.products.find((p) => p.id === Number(id));
  if (!product) return <EmptyState icon={Info} title="Plato no disponible" text="Puede que se haya agotado. Volvé a la carta para ver otras opciones." />;
  const icon = data.categories.find((c) => c.id === product.category_id)?.icon;
  return <ProductDetail key={product.id} product={product} icon={icon} />;
}
