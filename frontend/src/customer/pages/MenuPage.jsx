import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Box, Flame, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { money } from '../../lib/format.js';
import { TAG_LABELS } from '../../lib/legal.js';
import { CategoryIcon } from '../../lib/icons.jsx';
import { Chip, EmptyState, ErrorState, Spinner, cx } from '../../ui/index.jsx';
import { useMenu, useCart, cartCount, cartTotal, useTable, loadMenu } from '../store.js';
import ProductCard from '../components/ProductCard.jsx';
import LegalFooter from '../components/LegalFooter.jsx';

const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function MenuPage() {
  const { data, error, loading } = useMenu();
  const cart = useCart();
  const { info } = useTable();
  const [category, setCategory] = useState(null);
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const q = useDeferredValue(query);

  const filtered = useMemo(() => {
    if (!data) return [];
    const nq = normalize(q.trim());
    return data.products.filter(
      (p) =>
        (!category || p.category_id === category) &&
        tags.every((t) => p.tags.includes(t)) &&
        (!nq || normalize(`${p.name} ${p.description}`).includes(nq)),
    );
  }, [data, category, tags, q]);

  if (error && !data) return <ErrorState error={error} onRetry={() => loadMenu(true)} />;
  if (loading || !data) return <Spinner label="Cargando la carta…" />;

  const iconOf = Object.fromEntries(data.categories.map((c) => [c.id, c.icon]));
  const featured = data.products.filter((p) => p.featured && p.model);
  const withModels = data.products.filter((p) => p.model).length;
  const isFiltering = !!(category || tags.length || q.trim());
  const grouped = data.categories.map((c) => ({ ...c, items: filtered.filter((p) => p.category_id === c.id) })).filter((c) => c.items.length);
  const count = cartCount(cart);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-end justify-between gap-3">
        <div>
          <p className="label-caps flex items-center gap-1.5 text-primary">
            Bienvenido <span className="size-1.5 rounded-full bg-tertiary-container" aria-hidden="true" />
          </p>
          <h1 className="font-headline text-display font-bold tracking-tight">¡Hola!</h1>
          {data.settings.welcome_message && <p className="mt-1 text-sm text-on-surface-variant">{data.settings.welcome_message}</p>}
        </div>
      </section>

      {withModels > 0 && (
        <Link href="/ar" className="card flex items-center gap-4 p-4 transition hover:shadow-raised">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full bg-secondary-container px-2.5 py-0.5 text-label font-bold text-on-secondary-container">¡Novedad AR!</span>
              <span className="rounded-full bg-tertiary-fixed/60 px-2.5 py-0.5 text-label font-semibold text-tertiary">Escala 1:1</span>
            </div>
            <h2 className="mt-2 font-headline text-headline-md font-bold">Mirá tus platos en tamaño real</h2>
            <p className="text-sm text-on-surface-variant">Proyectá la comida en tu mesa con la cámara antes de pedir.</p>
          </div>
          <span className="grid size-16 shrink-0 place-items-center rounded-full bg-primary-fixed text-primary">
            <Box className="size-8" aria-hidden="true" />
          </span>
        </Link>
      )}

      {data.promotions.map((p) => (
        <p key={p.id} className="flex items-center gap-3 rounded-card bg-secondary-fixed px-4 py-3 text-sm text-on-secondary-container">
          <Flame className="size-5 shrink-0" aria-hidden="true" />
          <span>
            <strong>{p.name}:</strong> {p.description || `${p.percent}% de descuento`} · hasta las {p.end_time} h
          </span>
        </p>
      ))}

      <section className="flex flex-col gap-3" aria-label="Buscar y filtrar">
        <div className="flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Buscar en la carta</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-outline" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar platos, bebidas, cafés…"
              className="h-12 w-full rounded-full border-[1.5px] border-outline-variant/50 bg-surface-lowest pr-4 pl-12 text-sm outline-none focus:border-primary-container"
            />
          </label>
          <button
            type="button"
            aria-expanded={showFilters}
            aria-label="Filtros alimentarios"
            onClick={() => setShowFilters((s) => !s)}
            className={cx('relative grid size-12 shrink-0 place-items-center rounded-full', showFilters || tags.length ? 'bg-on-surface text-surface' : 'bg-surface-container')}
          >
            <SlidersHorizontal className="size-5" aria-hidden="true" />
            {tags.length > 0 && <span className="absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-secondary-container text-micro font-bold text-on-secondary-container">{tags.length}</span>}
          </button>
        </div>
        {showFilters && (
          <div className="scrollbar-none flex gap-2 overflow-x-auto" role="group" aria-label="Preferencias alimentarias">
            {Object.entries(TAG_LABELS).map(([k, label]) => (
              <Chip key={k} active={tags.includes(k)} onClick={() => setTags((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]))}>
                {label}
              </Chip>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="cat-title">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="cat-title" className="font-headline text-headline-md font-bold">Categorías</h2>
          <span className="text-label font-semibold text-primary">{data.categories.length} secciones</span>
        </div>
        <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {[{ id: null, name: 'Todos', icon: 'utensils', count: data.products.length }, ...data.categories].map((c) => {
            const active = category === c.id;
            return (
              <button
                key={c.id ?? 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(c.id)}
                className={cx('flex w-20 shrink-0 flex-col items-center gap-1 rounded-card py-3 transition', active ? 'bg-on-surface text-surface shadow-raised' : 'bg-surface-lowest shadow-base')}
              >
                <CategoryIcon name={c.icon} className="size-6" />
                <span className="w-full truncate px-1 text-label font-semibold">{c.name}</span>
                <span className={cx('text-micro', active ? 'text-surface/70' : 'text-on-surface-variant')}>{c.count}</span>
              </button>
            );
          })}
        </div>
      </section>

      {!isFiltering && featured.length > 0 && (
        <section aria-labelledby="feat-title">
          <h2 id="feat-title" className="mb-3 flex items-center gap-2 font-headline text-headline-md font-bold">
            <Sparkles className="size-6 text-primary" aria-hidden="true" /> Destacados con modo AR
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} categoryIcon={iconOf[p.category_id]} />
            ))}
          </div>
        </section>
      )}

      {grouped.length === 0 && (
        <EmptyState
          icon={Search}
          title="No encontramos platos"
          text="Probá con otra búsqueda o quitá algún filtro."
          action={
            <button type="button" className="flex items-center gap-1 text-sm font-semibold text-primary" onClick={() => { setQuery(''); setTags([]); setCategory(null); }}>
              <X className="size-4" aria-hidden="true" /> Limpiar filtros
            </button>
          }
        />
      )}

      {grouped.map((c) => (
        <section key={c.id} aria-labelledby={`cat-${c.id}`}>
          <h2 id={`cat-${c.id}`} className="mb-3 flex items-center gap-2 font-headline text-headline-md font-bold">
            <CategoryIcon name={c.icon} className="size-6 text-primary" /> {c.name}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {c.items.map((p) => (
              <ProductCard key={p.id} product={p} categoryIcon={c.icon} />
            ))}
          </div>
        </section>
      ))}

      <LegalFooter hasAlcohol={data.products.some((p) => p.is_alcoholic)} />

      {count > 0 && (
        <Link href="/pedido" className="fixed inset-x-4 bottom-[5.5rem] z-30 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-full bg-on-surface p-2 pl-3 text-surface shadow-overlay sm:inset-x-auto sm:left-1/2 sm:w-[32rem] sm:-translate-x-1/2">
          <span className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-primary-container font-bold">{count}</span>
            <span className="leading-tight">
              <span className="block text-micro uppercase opacity-70">Pedido {info ? `mesa ${info.table.number}` : ''}</span>
              <span className="font-headline text-headline-sm font-bold">{money(cartTotal(cart))}</span>
            </span>
          </span>
          <span className="flex h-11 items-center gap-1 rounded-full bg-primary-container px-5 text-sm font-semibold">
            Ver pedido <ArrowRight className="size-4" aria-hidden="true" />
          </span>
        </Link>
      )}
    </div>
  );
}
