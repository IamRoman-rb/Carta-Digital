import { Link, useLocation } from 'wouter';
import { Box, Plus, Ruler } from 'lucide-react';
import { money } from '../../lib/format.js';
import { TAG_LABELS } from '../../lib/legal.js';
import { notify } from '../../lib/notify.js';
import { Badge, Button } from '../../ui/index.jsx';
import DishImage from '../../shared/DishImage.jsx';
import { cartActions } from '../store.js';

export function Price({ product, className = '' }) {
  const reference = product.promo ? product.price : product.regular_price;
  return (
    <span className={`flex flex-col items-end leading-tight ${className}`}>
      {reference && reference > product.final_price && (
        <s className="text-label text-on-surface-variant" aria-label={`Antes ${money(reference)}`}>
          {money(reference)}
        </s>
      )}
      <span className="font-headline text-headline-sm font-bold text-primary">{money(product.final_price)}</span>
    </span>
  );
}

export default function ProductCard({ product, categoryIcon }) {
  const [, navigate] = useLocation();
  const needsChoice = product.modifier_groups.some((g) => g.min_select > 0);

  function quickAdd() {
    if (needsChoice) return navigate(`/plato/${product.id}`);
    cartActions.add({ product_id: product.id, name: product.name, unit_price: product.final_price, quantity: 1, modifiers: [], modifierNames: [], notes: '' });
    notify.toast(`${product.name} agregado al pedido`);
  }

  return (
    <article className="card flex flex-col overflow-hidden transition hover:shadow-raised">
      <Link href={`/plato/${product.id}`} className="relative block aspect-[4/3] overflow-hidden" aria-label={`Ver detalle de ${product.name}`}>
        <DishImage product={product} icon={categoryIcon} className="size-full transition duration-500 hover:scale-105" />
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {product.promo && <Badge tone="honey">-{product.promo.percent}% {product.promo.name}</Badge>}
          {product.badge && <Badge tone="primary" className="!bg-primary-container !text-white">{product.badge}</Badge>}
          {product.serves && <Badge className="!bg-surface-lowest/90">{product.serves}</Badge>}
        </div>
        {product.diameter_cm && (
          <span className="hud absolute bottom-3 left-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-label font-semibold text-white">
            <Ruler className="size-3.5" aria-hidden="true" /> Plato: {product.diameter_cm} cm diám.
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-headline text-headline-sm font-semibold">{product.name}</h3>
          <Price product={product} />
        </div>
        <p className="line-clamp-3 text-sm text-on-surface-variant">{product.description}</p>
        {(product.tags.length > 0 || product.is_combo) && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Características">
            {product.tags.map((t) => (
              <li key={t}>
                <Badge tone="sage">{TAG_LABELS[t]}</Badge>
              </li>
            ))}
            {product.combo.map((c) => (
              <li key={c.name}>
                <Badge>{c.quantity}x {c.name}</Badge>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex gap-2 pt-2">
          {product.model && (
            <Button variant="soft" size="md" icon={Box} className="flex-1" onClick={() => navigate(`/ar/${product.id}`)}>
              Ver en tu mesa
            </Button>
          )}
          <Button size="md" icon={Plus} className={product.model ? '' : 'flex-1'} onClick={quickAdd}>
            Pedir
          </Button>
        </div>
      </div>
    </article>
  );
}
