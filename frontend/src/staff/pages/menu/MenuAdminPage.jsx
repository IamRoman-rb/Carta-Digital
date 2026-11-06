import { useDeferredValue, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BarChart3, Box, Clock, ExternalLink, Flame, Pencil, Percent, Plus, Search, Sparkles, Tag, Trash2, Archive } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { money } from '../../../lib/format.js';
import { CategoryIcon, categoryIconNames } from '../../../lib/icons.jsx';
import { notify } from '../../../lib/notify.js';
import { useAsync } from '../../../lib/hooks.js';
import { Badge, Button, Checkbox, Chip, EmptyState, IconButton, Input, Modal, PageHeader, Select, Spinner, StatCard, Tabs, Toggle, cx } from '../../../ui/index.jsx';
import DishImage from '../../../shared/DishImage.jsx';
import { useAuth } from '../../auth.jsx';
import { useFloor } from '../../staffData.jsx';
import { useRealtimeEvent } from '../../realtime.js';
import ProductForm from './ProductForm.jsx';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const marginOf = (p) => (p.price ? Math.round(((p.price - p.cost) / p.price) * 1000) / 10 : 0);

// ------------------------------------------------------------------ Promociones
const promoSchema = z
  .object({
    name: z.string().trim().min(2, 'Requerido').max(60),
    description: z.string().max(200),
    percent: z.coerce.number().gt(0, 'Mayor a 0').lt(100, 'Menor a 100'),
    target_type: z.enum(['all', 'category', 'product']),
    target_id: z.union([z.literal(''), z.coerce.number().int().positive()]),
    days: z.array(z.coerce.number()).min(1, 'Elegí al menos un día'),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
    active: z.boolean(),
  })
  .refine((p) => p.target_type === 'all' || p.target_id !== '', { message: 'Elegí a qué aplica', path: ['target_id'] });

function PromotionForm({ promo, catalog, onDone }) {
  const { register, handleSubmit, control, setValue, formState } = useForm({
    resolver: zodResolver(promoSchema),
    defaultValues: promo ? { ...promo, target_id: promo.target_id ?? '' } : { name: '', description: '', percent: 15, target_type: 'category', target_id: '', days: [1, 2, 3, 4, 5], start_time: '18:00', end_time: '21:00', active: true },
  });
  const [targetType, days] = useWatch({ control, name: ['target_type', 'days'] });
  const onSubmit = handleSubmit(async (d) => {
    const body = { ...d, target_id: d.target_type === 'all' ? null : d.target_id };
    try {
      if (promo) await api.put(`/menu/promotions/${promo.id}`, body);
      else await api.post('/menu/promotions', body);
      notify.toast('Promoción guardada');
      onDone();
    } catch (err) {
      notify.error(err);
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3 sm:grid-cols-2">
      <Input label="Nombre" error={formState.errors.name} {...register('name')} />
      <Input label="Descuento (%)" type="number" error={formState.errors.percent} {...register('percent')} />
      <Input label="Descripción visible en la carta" className="sm:col-span-2" {...register('description')} />
      <Select label="Aplica a" {...register('target_type')}>
        <option value="all">Toda la carta</option>
        <option value="category">Una categoría</option>
        <option value="product">Un producto</option>
      </Select>
      {targetType !== 'all' && (
        <Select label={targetType === 'category' ? 'Categoría' : 'Producto'} error={formState.errors.target_id} {...register('target_id')}>
          <option value="">Elegí…</option>
          {(targetType === 'category' ? catalog.categories : catalog.products).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
      )}
      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-label font-semibold text-on-surface-variant">Días</legend>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((dName, i) => (
            <Chip key={i} active={days.includes(i)} onClick={() => setValue('days', days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort())}>{dName}</Chip>
          ))}
        </div>
        {formState.errors.days && <p className="mt-1 text-label text-error">{formState.errors.days.message}</p>}
      </fieldset>
      <Input label="Desde" type="time" {...register('start_time')} />
      <Input label="Hasta" type="time" hint="Puede cruzar la medianoche" {...register('end_time')} />
      <Checkbox label="Activa" {...register('active')} />
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button variant="muted" onClick={onDone}>Cancelar</Button>
        <Button type="submit" loading={formState.isSubmitting}>Guardar</Button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ Categorías
function CategoriesPanel({ categories, onChange, canEdit }) {
  const [editing, setEditing] = useState(null);
  const { register, handleSubmit, reset, formState } = useForm({
    resolver: zodResolver(z.object({ name: z.string().trim().min(2, 'Requerido').max(40), icon: z.string(), sort_order: z.coerce.number().int().min(0), active: z.boolean() })),
  });
  const edit = (c) => {
    setEditing(c ?? {});
    reset(c ? { name: c.name, icon: c.icon, sort_order: c.sort_order, active: c.active } : { name: '', icon: 'utensils', sort_order: categories.length, active: true });
  };
  const save = handleSubmit(async (d) => {
    try {
      if (editing.id) await api.put(`/menu/categories/${editing.id}`, d);
      else await api.post('/menu/categories', d);
      setEditing(null);
      onChange();
    } catch (err) {
      notify.error(err);
    }
  });
  async function remove(c) {
    if (!(await notify.confirm({ title: `¿Eliminar "${c.name}"?`, danger: true, confirmText: 'Eliminar' }))) return;
    try {
      await api.del(`/menu/categories/${c.id}`);
      onChange();
    } catch (err) {
      notify.error(err);
    }
  }
  return (
    <section className="card flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-headline text-headline-sm font-bold">Categorías de la carta</h2>
        {canEdit && <Button size="sm" icon={Plus} onClick={() => edit(null)}>Categoría</Button>}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-2xl bg-surface-low p-3">
            <span className="grid size-10 place-items-center rounded-full bg-primary-fixed text-primary"><CategoryIcon name={c.icon} className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{c.name}</span>
              <span className="text-label text-on-surface-variant">{c.product_count} platos · orden {c.sort_order}{!c.active && ' · oculta'}</span>
            </span>
            {canEdit && (
              <>
                <IconButton label={`Editar ${c.name}`} icon={Pencil} className="size-9" onClick={() => edit(c)} />
                <IconButton label={`Eliminar ${c.name}`} icon={Trash2} className="size-9" onClick={() => remove(c)} />
              </>
            )}
          </li>
        ))}
      </ul>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar categoría' : 'Nueva categoría'} size="sm">
        <form onSubmit={save} noValidate className="flex flex-col gap-3">
          <Input label="Nombre" error={formState.errors.name} {...register('name')} />
          <Select label="Ícono" {...register('icon')}>
            {categoryIconNames.map((i) => <option key={i} value={i}>{i}</option>)}
          </Select>
          <Input label="Orden" type="number" {...register('sort_order')} />
          <Checkbox label="Visible en la carta" {...register('active')} />
          <Button type="submit" loading={formState.isSubmitting}>Guardar</Button>
        </form>
      </Modal>
    </section>
  );
}

// ------------------------------------------------------------------ Ajuste masivo
function BulkModal({ open, onClose, categories, onDone }) {
  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(z.object({ percent: z.coerce.number().min(-90).max(500).refine((v) => v !== 0, 'Distinto de 0'), category_id: z.union([z.literal(''), z.coerce.number()]), round_to: z.coerce.number() })),
    defaultValues: { percent: 10, category_id: '', round_to: 10000 },
  });
  const submit = handleSubmit(async (d) => {
    const ok = await notify.confirm({ title: `¿Ajustar precios ${d.percent > 0 ? '+' : ''}${d.percent}%?`, text: 'Se modifican los precios de carta de forma inmediata.', confirmText: 'Aplicar' });
    if (!ok) return;
    try {
      const r = await api.post('/menu/prices/bulk', { ...d, category_id: d.category_id || null });
      notify.toast(`${r.updated} precios actualizados`);
      onDone();
    } catch (err) {
      notify.error(err);
    }
  });
  return (
    <Modal open={open} onClose={onClose} title="Ajuste masivo de precios" size="sm">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <Input label="Porcentaje (+ aumenta, − baja)" type="number" step="0.5" error={formState.errors.percent} {...register('percent')} />
        <Select label="Categoría" {...register('category_id')}>
          <option value="">Toda la carta</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select label="Redondear a" {...register('round_to')}>
          <option value={100}>$1</option>
          <option value={1000}>$10</option>
          <option value={5000}>$50</option>
          <option value={10000}>$100</option>
        </Select>
        <Button type="submit" icon={Percent} loading={formState.isSubmitting}>Aplicar ajuste</Button>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ Página
export default function MenuAdminPage() {
  const { can } = useAuth();
  const { settings } = useFloor();
  const catalog = useAsync(() => api.get('/menu'), []);
  useRealtimeEvent(['menu.changed'], () => catalog.reload({ silent: true }), 500);
  const [tab, setTab] = useState('catalog');
  const [category, setCategory] = useState(null);
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState(null);
  const [promoEditor, setPromoEditor] = useState(null);
  const [bulk, setBulk] = useState(false);
  const q = useDeferredValue(query);
  const canEdit = can('carta.editar');

  if (!catalog.data) return <Spinner />;
  const { categories, products, promotions, activePromotionIds, constants } = catalog.data;
  const ctx = { categories, products, ...constants, defaultVat: settings?.default_vat_rate ?? 21 };
  const nonCombos = products.filter((p) => !p.is_combo);
  const combos = products.filter((p) => p.is_combo);
  const withModel = products.filter((p) => p.model_path).length;
  const paused = products.filter((p) => !p.available).length;
  const avgMargin = products.length ? Math.round((products.reduce((s, p) => s + marginOf(p), 0) / products.length) * 10) / 10 : 0;

  const list = products.filter(
    (p) =>
      (!category || p.category_id === category) &&
      (status === 'all' || (status === 'active' && p.available) || (status === 'ar' && p.model_path) || (status === 'paused' && !p.available)) &&
      (!q || `${p.name} ${p.sku ?? ''}`.toLowerCase().includes(q.toLowerCase())),
  );

  const run = async (fn, ok) => {
    try {
      await fn();
      if (ok) notify.toast(ok);
      catalog.reload({ silent: true });
    } catch (err) {
      notify.error(err);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Catálogo digital y motor espacial AR"
        title="Carta, precios y promociones"
        description="Administrá los platos visibles en la carta, sus modelos 3D y las reglas de precios automáticas."
        actions={
          <>
            {can('carta.precios') && <Button variant="muted" icon={Percent} onClick={() => setBulk(true)}>Ajuste masivo</Button>}
            <Button variant="muted" icon={ExternalLink} onClick={() => window.open('/', '_blank', 'noopener')}>Ver carta pública</Button>
            {canEdit && <Button variant="soft" icon={Tag} onClick={() => setEditor({ defaults: { is_combo: true, station: 'frios' } })}>Crear combo</Button>}
            {canEdit && <Button icon={Plus} onClick={() => setEditor({})}>Nuevo plato</Button>}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Margen promedio" value={`${avgMargin}%`} icon={BarChart3} tone="sage" />
        <StatCard label="Platos con modelo 3D" value={`${withModel} / ${products.length}`} hint={`${products.length ? Math.round((withModel / products.length) * 100) : 0}% de cobertura`} icon={Box} />
        <StatCard label="Promos activas ahora" value={activePromotionIds.length} hint={`${promotions.length} configuradas`} icon={Flame} tone="honey" />
        <StatCard label="Pausados / sin stock" value={paused} icon={Archive} tone={paused ? 'alert' : 'neutral'} />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'catalog', label: 'Catálogo de platos', count: nonCombos.length },
          { value: 'promos', label: 'Combos y promociones', count: combos.length + promotions.length },
          { value: 'models', label: 'Modelos 3D y AR', count: withModel },
          { value: 'categories', label: 'Categorías', count: categories.length },
        ]}
      />

      {tab === 'catalog' && (
        <section className="card flex flex-col gap-4 p-4 lg:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Buscar plato</span>
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-outline" aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por plato o SKU…" className="h-11 w-full rounded-full border-[1.5px] border-outline-variant/50 bg-surface-lowest pr-4 pl-12 text-sm outline-none focus:border-primary-container" />
            </label>
            <Tabs value={status} onChange={setStatus} tabs={[{ value: 'all', label: 'Todos' }, { value: 'active', label: 'Activos' }, { value: 'ar', label: 'Con AR 3D' }, { value: 'paused', label: 'Sin stock' }]} />
          </div>
          <div className="scrollbar-none flex gap-2 overflow-x-auto">
            <Chip active={!category} onClick={() => setCategory(null)}>Todas ({products.length})</Chip>
            {categories.map((c) => <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>{c.name} ({c.product_count})</Chip>)}
          </div>
          {list.length === 0 ? (
            <EmptyState icon={Search} title="Sin resultados" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="label-caps text-left">
                    <th className="py-2">Plato</th><th>Costo / margen</th><th>Precio venta</th><th className="text-center">En carta</th><th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {list.map((p) => (
                    <tr key={p.id} className={cx(!p.available && 'opacity-60')}>
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <DishImage product={p} icon={categories.find((c) => c.id === p.category_id)?.icon} className="size-12 shrink-0 rounded-full" sizes="48px" />
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                              {p.name}
                              {p.badge && <Badge tone="honey">{p.badge}</Badge>}
                              {p.promo && <Badge tone="primary">-{p.promo.percent}%</Badge>}
                              {p.is_combo && <Badge>Combo</Badge>}
                            </p>
                            <p className="text-label text-on-surface-variant">
                              {p.model_path ? <span className="text-primary">● Modelo 3D{p.diameter_cm ? ` (${p.diameter_cm} cm)` : ''}</span> : 'Sin 3D'} · SKU {p.sku ?? '—'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="block">{money(p.cost)} costo</span>
                        <span className={cx('text-label font-semibold', marginOf(p) >= 60 ? 'text-tertiary' : marginOf(p) >= 40 ? 'text-secondary' : 'text-error')}>{marginOf(p)}% margen</span>
                      </td>
                      <td>
                        <span className="font-headline text-headline-sm font-bold">{money(p.price)}</span>
                        {p.promo && <span className="block text-label text-primary">Hoy {money(p.finalPrice)}</span>}
                      </td>
                      <td className="text-center">
                        <Toggle checked={p.available} label={`${p.name} visible en carta`} disabled={!can('carta.editar', 'cocina.operar')} onChange={(v) => run(() => api.patch(`/menu/products/${p.id}/availability`, { available: v }), v ? 'Plato activado' : 'Plato pausado')} />
                      </td>
                      <td className="text-right">
                        {canEdit && (
                          <div className="flex justify-end gap-1">
                            <IconButton label={`Editar ${p.name}`} icon={Pencil} onClick={() => setEditor({ product: p })} />
                            <IconButton
                              label={`Eliminar ${p.name}`}
                              icon={Trash2}
                              onClick={async () => (await notify.confirm({ title: `¿Eliminar "${p.name}"?`, text: 'Deja de mostrarse en la carta. El historial de ventas se conserva.', danger: true, confirmText: 'Eliminar' })) && run(() => api.del(`/menu/products/${p.id}`), 'Plato eliminado')}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'promos' && (
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-headline text-headline-md font-bold"><Tag className="size-6 text-primary" aria-hidden="true" /> Combos</h2>
              {canEdit && <Button size="sm" icon={Plus} onClick={() => setEditor({ defaults: { is_combo: true, station: 'frios' } })}>Crear combo</Button>}
            </div>
            {combos.length === 0 && <EmptyState icon={Tag} title="Sin combos" text="Agrupá productos con un precio especial." />}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {combos.map((c) => {
                const regular = c.combo_items.reduce((s, ci) => s + (products.find((p) => p.id === ci.product_id)?.price ?? 0) * ci.quantity, 0);
                return (
                  <article key={c.id} className="card flex flex-col gap-2 p-5">
                    <div className="flex items-center justify-between">
                      {regular > c.price ? <Badge tone="honey">{Math.round((1 - c.price / regular) * 100)}% ahorro</Badge> : <Badge>Precio fijo</Badge>}
                      <span className={cx('size-2.5 rounded-full', c.available ? 'bg-tertiary-container' : 'bg-outline')} aria-label={c.available ? 'Activo' : 'Pausado'} />
                    </div>
                    <h3 className="font-headline text-headline-sm font-bold">{c.name}</h3>
                    <p className="text-sm text-on-surface-variant">{c.combo_items.map((ci) => `${ci.quantity}x ${products.find((p) => p.id === ci.product_id)?.name ?? '—'}`).join(' + ')}</p>
                    <div className="mt-auto flex items-end justify-between pt-2">
                      <span>
                        {regular > c.price && <s className="block text-label text-on-surface-variant">{money(regular)} regular</s>}
                        <span className="font-headline text-headline-md font-bold text-primary">{money(c.price)}</span>
                      </span>
                      {canEdit && <IconButton label={`Editar ${c.name}`} icon={Pencil} onClick={() => setEditor({ product: c })} />}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-headline text-headline-md font-bold"><Clock className="size-6 text-primary" aria-hidden="true" /> Reglas de horario y happy hour</h2>
              {canEdit && <Button size="sm" icon={Plus} onClick={() => setPromoEditor({})}>Nueva promoción</Button>}
            </div>
            {promotions.length === 0 && <EmptyState icon={Flame} title="Sin promociones" />}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {promotions.map((p) => {
                const target = p.target_type === 'all' ? 'Toda la carta' : p.target_type === 'category' ? categories.find((c) => c.id === p.target_id)?.name : products.find((x) => x.id === p.target_id)?.name;
                const live = activePromotionIds.includes(p.id);
                return (
                  <article key={p.id} className="card flex flex-col gap-2 p-5">
                    <div className="flex items-center justify-between">
                      <Badge tone={live ? 'sage' : 'neutral'}>{live ? 'Activa ahora' : p.active ? 'Programada' : 'Desactivada'}</Badge>
                      <span className="font-headline text-headline-md font-bold text-primary">-{p.percent}%</span>
                    </div>
                    <h3 className="font-headline text-headline-sm font-bold">{p.name}</h3>
                    <p className="text-sm text-on-surface-variant">{p.description || target}</p>
                    <p className="flex items-center gap-2 rounded-2xl bg-surface-low p-2 text-label"><Clock className="size-4" aria-hidden="true" /> {p.days.map((d) => DAYS[d]).join(', ')} · {p.start_time} a {p.end_time} h · {target}</p>
                    {canEdit && (
                      <div className="mt-auto flex justify-end gap-1 pt-1">
                        <Toggle checked={p.active} label={`Activar ${p.name}`} onChange={(v) => run(() => api.put(`/menu/promotions/${p.id}`, { ...p, active: v }))} className="mr-auto" />
                        <IconButton label={`Editar ${p.name}`} icon={Pencil} onClick={() => setPromoEditor({ promo: p })} />
                        <IconButton label={`Eliminar ${p.name}`} icon={Trash2} onClick={async () => (await notify.confirm({ title: `¿Eliminar "${p.name}"?`, danger: true, confirmText: 'Eliminar' })) && run(() => api.del(`/menu/promotions/${p.id}`), 'Promoción eliminada')} />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {tab === 'models' && (
        <section className="card flex flex-col gap-4 p-5">
          <p className="flex items-start gap-3 rounded-2xl bg-secondary-fixed/50 p-4 text-sm text-on-secondary-container">
            <Sparkles className="size-5 shrink-0" aria-hidden="true" />
            Al subir la foto de un plato con su diámetro, el sistema genera automáticamente un modelo 3D a escala real 1:1. Si tenés un modelo fotogramétrico (.glb), subilo desde “Editar” para reemplazarlo.
          </p>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {products.map((p) => {
              const state = p.model_path ? (p.model_auto ? { label: 'Automático desde foto', tone: 'sage' } : { label: 'Modelo propio .glb', tone: 'primary' }) : !p.image ? { label: 'Falta foto', tone: 'danger' } : { label: 'Falta diámetro', tone: 'honey' };
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-surface-low p-3">
                  <DishImage product={p} className="size-14 shrink-0 rounded-xl" sizes="56px" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <Badge tone={state.tone}>{state.label}</Badge>
                    {p.diameter_cm && <span className="ml-1 text-label text-on-surface-variant">Ø {p.diameter_cm} cm</span>}
                  </span>
                  {p.model_path && <IconButton label={`Ver ${p.name} en 3D`} icon={Box} onClick={() => window.open(`/ar/${p.id}`, '_blank', 'noopener')} />}
                  {canEdit && <IconButton label={`Editar ${p.name}`} icon={Pencil} onClick={() => setEditor({ product: p })} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tab === 'categories' && <CategoriesPanel categories={categories} canEdit={canEdit} onChange={() => catalog.reload({ silent: true })} />}

      <Modal open={!!editor} onClose={() => setEditor(null)} title={editor?.product ? `Editar: ${editor.product.name}` : editor?.defaults?.is_combo ? 'Nuevo combo' : 'Nuevo plato'} size="lg">
        {editor && (
          <ProductForm
            product={editor.product}
            defaults={editor.defaults}
            catalog={ctx}
            onCancel={() => setEditor(null)}
            onSaved={() => catalog.reload({ silent: true })}
          />
        )}
      </Modal>
      <Modal open={!!promoEditor} onClose={() => setPromoEditor(null)} title={promoEditor?.promo ? 'Editar promoción' : 'Nueva promoción'}>
        {promoEditor && <PromotionForm promo={promoEditor.promo} catalog={ctx} onDone={() => { setPromoEditor(null); catalog.reload({ silent: true }); }} />}
      </Modal>
      <BulkModal open={bulk} onClose={() => setBulk(false)} categories={categories} onDone={() => { setBulk(false); catalog.reload({ silent: true }); }} />
    </div>
  );
}
