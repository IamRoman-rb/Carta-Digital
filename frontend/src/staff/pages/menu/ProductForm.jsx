import { useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Box, ImagePlus, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { money, toCents, toPesos } from '../../../lib/format.js';
import { ALLERGEN_LABELS, STATION_LABELS, TAG_LABELS } from '../../../lib/legal.js';
import { mediaUrl } from '../../../lib/media.js';
import { notify } from '../../../lib/notify.js';
import { Button, Checkbox, Chip, IconButton, Input, Select, Textarea } from '../../../ui/index.jsx';
import { useAuth } from '../../auth.jsx';

const num = (msg) => z.coerce.number({ message: msg }).min(0, msg);

const schema = z
  .object({
    name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(80),
    category_id: z.coerce.number().int().positive('Elegí una categoría'),
    sku: z.string().trim().max(30).optional(),
    description: z.string().trim().max(400),
    price: num('Precio inválido'),
    cost: num('Costo inválido'),
    vat_rate: z.coerce.number(),
    station: z.string().min(1),
    prep_minutes: z.coerce.number().int().min(0).max(240),
    diameter_cm: z.union([z.literal(''), z.coerce.number().min(5, 'Mínimo 5 cm').max(120, 'Máximo 120 cm')]),
    serves: z.string().max(40).optional(),
    badge: z.string().max(30).optional(),
    tags: z.array(z.string()),
    allergens: z.array(z.string()),
    is_alcoholic: z.boolean(),
    available: z.boolean(),
    featured: z.boolean(),
    is_combo: z.boolean(),
    combo_items: z.array(z.object({ product_id: z.coerce.number().int().positive('Elegí un producto'), quantity: z.coerce.number().int().min(1).max(20) })),
    modifier_groups: z.array(
      z.object({
        name: z.string().trim().min(1, 'Nombre requerido'),
        min_select: z.coerce.number().int().min(0).max(10),
        max_select: z.coerce.number().int().min(1).max(10),
        options: z.array(z.object({ name: z.string().trim().min(1, 'Requerido'), description: z.string().max(120).optional(), price_delta: num('Inválido') })).min(1, 'Agregá al menos una opción'),
      }),
    ),
  })
  .refine((d) => !d.is_combo || d.combo_items.length > 0, { message: 'El combo debe incluir productos', path: ['combo_items'] });

const toForm = (p, vat) =>
  p
    ? {
        ...p,
        sku: p.sku ?? '',
        serves: p.serves ?? '',
        badge: p.badge ?? '',
        price: toPesos(p.price),
        cost: toPesos(p.cost),
        diameter_cm: p.diameter_cm ?? '',
        modifier_groups: p.modifier_groups.map((g) => ({ ...g, options: g.options.map((o) => ({ ...o, price_delta: toPesos(o.price_delta) })) })),
      }
    : {
        name: '', category_id: '', sku: '', description: '', price: '', cost: 0, vat_rate: vat, station: 'cocina', prep_minutes: 15, diameter_cm: '', serves: '', badge: '',
        tags: [], allergens: [], is_alcoholic: false, available: true, featured: false, is_combo: false, combo_items: [], modifier_groups: [],
      };

function GroupEditor({ control, register, index, remove, errors }) {
  const options = useFieldArray({ control, name: `modifier_groups.${index}.options` });
  const e = errors?.modifier_groups?.[index];
  return (
    <fieldset className="flex flex-col gap-3 rounded-2xl bg-surface-low p-4">
      <div className="grid grid-cols-[1fr_5rem_5rem_auto] items-end gap-2">
        <Input label="Grupo" placeholder="Ej.: Guarnición" error={e?.name} {...register(`modifier_groups.${index}.name`)} />
        <Input label="Mín." type="number" {...register(`modifier_groups.${index}.min_select`)} />
        <Input label="Máx." type="number" {...register(`modifier_groups.${index}.max_select`)} />
        <IconButton label="Quitar grupo" icon={Trash2} variant="ghost" onClick={() => remove(index)} />
      </div>
      {options.fields.map((f, oi) => (
        <div key={f.id} className="grid grid-cols-[1fr_1fr_6rem_auto] items-end gap-2">
          <Input placeholder="Opción" aria-label="Nombre de la opción" error={e?.options?.[oi]?.name} {...register(`modifier_groups.${index}.options.${oi}.name`)} />
          <Input placeholder="Descripción" aria-label="Descripción de la opción" {...register(`modifier_groups.${index}.options.${oi}.description`)} />
          <Input placeholder="+$" type="number" aria-label="Recargo en pesos" {...register(`modifier_groups.${index}.options.${oi}.price_delta`)} />
          <IconButton label="Quitar opción" icon={Trash2} className="size-9" onClick={() => options.remove(oi)} />
        </div>
      ))}
      {e?.options?.message && <p className="text-label text-error">{e.options.message}</p>}
      <Button size="sm" variant="ghost" icon={Plus} className="self-start" onClick={() => options.append({ name: '', description: '', price_delta: 0 })}>Opción</Button>
    </fieldset>
  );
}

export default function ProductForm({ product, catalog, defaults, onSaved, onCancel }) {
  const { can } = useAuth();
  const [current, setCurrent] = useState(product);
  const [uploading, setUploading] = useState(null);
  const { register, control, handleSubmit, formState, setValue } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { ...toForm(product, catalog.defaultVat), ...defaults },
  });
  const groups = useFieldArray({ control, name: 'modifier_groups' });
  const combo = useFieldArray({ control, name: 'combo_items' });
  const [price, cost, tags, allergens, isCombo] = useWatch({ control, name: ['price', 'cost', 'tags', 'allergens', 'is_combo'] });
  const margin = Number(price) > 0 ? Math.round(((Number(price) - Number(cost || 0)) / Number(price)) * 1000) / 10 : 0;
  const errors = formState.errors;
  const canPrice = can('carta.precios');

  const onSubmit = handleSubmit(async (d) => {
    const body = {
      ...d,
      price: toCents(d.price),
      cost: toCents(d.cost),
      diameter_cm: d.diameter_cm === '' ? null : d.diameter_cm,
      combo_items: d.is_combo ? d.combo_items : [],
      modifier_groups: d.modifier_groups.map((g) => ({ ...g, options: g.options.map((o) => ({ ...o, description: o.description ?? '', price_delta: toCents(o.price_delta) })) })),
    };
    try {
      const r = current ? await api.put(`/menu/products/${current.id}`, body) : await api.post('/menu/products', body);
      notify.toast(current ? 'Plato actualizado' : 'Plato creado. Ya podés subir la foto y el modelo 3D.');
      setCurrent(r.product);
      onSaved(r.product, !current);
    } catch (err) {
      notify.error(err);
    }
  });

  async function upload(kind, file) {
    if (!file || !current) return;
    setUploading(kind);
    try {
      const r = await api.upload(`/menu/products/${current.id}/${kind}`, file);
      setCurrent(r.product);
      onSaved(r.product, false);
      notify.toast(kind === 'image' ? 'Foto actualizada (y modelo 3D automático generado)' : 'Modelo 3D cargado');
    } catch (err) {
      notify.error(err);
    } finally {
      setUploading(null);
    }
  }

  async function resetModel() {
    try {
      const r = await api.del(`/menu/products/${current.id}/model`);
      setCurrent(r.product);
      onSaved(r.product, false);
    } catch (err) {
      notify.error(err);
    }
  }

  const toggleIn = (field, list, value) => setValue(field, list.includes(value) ? list.filter((x) => x !== value) : [...list, value], { shouldDirty: true });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <section className="grid gap-3 sm:grid-cols-2">
        <Input label="Nombre comercial" className="sm:col-span-2" error={errors.name} {...register('name')} />
        <Select label="Categoría" error={errors.category_id} {...register('category_id')}>
          <option value="">Elegí…</option>
          {catalog.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Input label="SKU / código interno" {...register('sku')} />
        <Textarea label="Descripción en carta" className="sm:col-span-2" error={errors.description} {...register('description')} />
      </section>

      <section className="grid gap-3 rounded-2xl bg-surface-container p-4 sm:grid-cols-3">
        <p className="label-caps sm:col-span-3">Estructura de precios y rentabilidad</p>
        <Input label="Precio al público ($, IVA incl.)" type="number" step="0.01" disabled={!canPrice} error={errors.price} {...register('price')} />
        <Input label="Costo insumos ($)" type="number" step="0.01" disabled={!canPrice} error={errors.cost} {...register('cost')} />
        <Select label="Alícuota IVA" {...register('vat_rate')}>
          {[21, 10.5, 27, 5, 2.5, 0].map((v) => <option key={v} value={v}>{v}%</option>)}
        </Select>
        <div className="sm:col-span-3">
          <div className="flex justify-between text-sm"><span>Margen bruto</span><strong className={margin >= 60 ? 'text-tertiary' : margin >= 40 ? 'text-secondary' : 'text-error'}>{margin}% ({money(toCents(price || 0) - toCents(cost || 0))})</strong></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-high"><div className="h-full rounded-full bg-tertiary-container" style={{ width: `${Math.max(0, Math.min(100, margin))}%` }} /></div>
        </div>
        {!canPrice && <p className="text-label text-on-surface-variant sm:col-span-3">Tu rol no puede modificar precios.</p>}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Select label="Estación de cocina (KDS)" {...register('station')}>
          {catalog.stations.map((s) => <option key={s} value={s}>{STATION_LABELS[s]}</option>)}
        </Select>
        <Input label="Tiempo de preparación (min)" type="number" {...register('prep_minutes')} />
        <Input label="Diámetro del plato (cm)" type="number" step="0.5" hint="Escala real para AR" error={errors.diameter_cm} {...register('diameter_cm')} />
        <Input label="Porción" placeholder="Para 2 personas" {...register('serves')} />
        <Input label="Etiqueta destacada" placeholder="Recomendado" {...register('badge')} />
      </section>

      <section className="flex flex-col gap-2">
        <p className="label-caps">Características</p>
        <div className="flex flex-wrap gap-2">{catalog.tags.map((t) => <Chip key={t} active={tags.includes(t)} onClick={() => toggleIn('tags', tags, t)}>{TAG_LABELS[t]}</Chip>)}</div>
        <p className="label-caps mt-2">Alérgenos (CAA art. 235 séptimo)</p>
        <div className="flex flex-wrap gap-2">{catalog.allergens.map((a) => <Chip key={a} active={allergens.includes(a)} onClick={() => toggleIn('allergens', allergens, a)}>{ALLERGEN_LABELS[a]}</Chip>)}</div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Checkbox label="Visible en carta" description="Desactivalo si no hay stock" {...register('available')} />
          <Checkbox label="Destacado" description="Aparece en “Destacados con modo AR”" {...register('featured')} />
          <Checkbox label="Bebida alcohólica" description="Muestra la leyenda de la Ley 24.788" {...register('is_alcoholic')} />
          <Checkbox label="Es un combo" description="Agrupa varios productos con precio especial" {...register('is_combo')} />
        </div>
      </section>

      {isCombo && (
        <section className="flex flex-col gap-2 rounded-2xl bg-secondary-fixed/40 p-4">
          <p className="label-caps">Productos incluidos en el combo</p>
          {combo.fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-[1fr_5rem_auto] items-end gap-2">
              <Select aria-label="Producto" error={errors.combo_items?.[i]?.product_id} {...register(`combo_items.${i}.product_id`)}>
                <option value="">Elegí…</option>
                {catalog.products.filter((p) => !p.is_combo).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Input type="number" aria-label="Cantidad" {...register(`combo_items.${i}.quantity`)} />
              <IconButton label="Quitar" icon={Trash2} onClick={() => combo.remove(i)} />
            </div>
          ))}
          {errors.combo_items?.message && <p className="text-label text-error">{errors.combo_items.message}</p>}
          <Button size="sm" variant="ghost" icon={Plus} className="self-start" onClick={() => combo.append({ product_id: '', quantity: 1 })}>Producto</Button>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="label-caps">Opciones y modificadores</p>
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => groups.append({ name: '', min_select: 0, max_select: 1, options: [{ name: '', description: '', price_delta: 0 }] })}>Grupo</Button>
        </div>
        {groups.fields.map((g, i) => <GroupEditor key={g.id} control={control} register={register} index={i} remove={groups.remove} errors={errors} />)}
      </section>

      <section className="grid gap-3 rounded-2xl bg-surface-low p-4 sm:grid-cols-2">
        <p className="label-caps sm:col-span-2">Foto y modelo 3D</p>
        {!current ? (
          <p className="text-sm text-on-surface-variant sm:col-span-2">Guardá el plato para poder subir la foto y el modelo 3D.</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              {current.image ? <img src={mediaUrl(current.image_sm)} alt="" className="size-16 rounded-xl object-cover" /> : <span className="grid size-16 place-items-center rounded-xl bg-surface-high"><ImagePlus className="size-6" aria-hidden="true" /></span>}
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-surface-container px-4 text-sm font-semibold">
                <Upload className="size-4" aria-hidden="true" /> {uploading === 'image' ? 'Subiendo…' : current.image ? 'Cambiar foto' : 'Subir foto'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload('image', e.target.files[0])} />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Box className="size-6 text-primary" aria-hidden="true" />
              <span className="text-sm">{current.model_path ? (current.model_auto ? 'Modelo automático (desde la foto)' : 'Modelo 3D propio (.glb)') : 'Sin modelo (requiere foto y diámetro)'}</span>
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-surface-container px-4 text-sm font-semibold">
                <Upload className="size-4" aria-hidden="true" /> {uploading === 'model' ? 'Subiendo…' : 'Subir .glb'}
                <input type="file" accept=".glb,model/gltf-binary" className="sr-only" onChange={(e) => upload('model', e.target.files[0])} />
              </label>
              {current.model_path && !current.model_auto && <Button size="sm" variant="ghost" icon={RotateCcw} onClick={resetModel}>Usar automático</Button>}
            </div>
          </>
        )}
      </section>

      <div className="sticky bottom-0 -mx-5 -mb-4 flex justify-end gap-2 border-t border-outline-variant/40 bg-surface px-5 py-3">
        <Button variant="muted" onClick={onCancel}>Cerrar</Button>
        <Button type="submit" loading={formState.isSubmitting}>Guardar plato</Button>
      </div>
    </form>
  );
}
