import { useForm, Controller, useWatch } from 'react-hook-form';
import { money } from '../lib/format.js';
import { Textarea, cx } from '../ui/index.jsx';

/**
 * Personalización de un plato (guarniciones, adicionales y notas) con react-hook-form.
 * Reglas por grupo: mínimo/máximo de opciones. Compartido por la carta y el panel del mozo.
 */
export function useModifierForm(product) {
  const form = useForm({
    mode: 'onChange',
    defaultValues: {
      groups: Object.fromEntries(product.modifier_groups.map((g) => [g.id, g.min_select === 1 && g.max_select === 1 ? [g.options[0].id] : []])),
      notes: '',
    },
  });
  const groups = useWatch({ control: form.control, name: 'groups' });
  const selected = Object.values(groups ?? {}).flat();
  const extras = product.modifier_groups.flatMap((g) => g.options).filter((o) => selected.includes(o.id)).reduce((s, o) => s + o.price_delta, 0);
  return { form, selected, unitPrice: product.final_price + extras };
}

export default function ModifierForm({ product, form }) {
  const { control, register, formState } = form;
  return (
    <div className="flex flex-col gap-6">
      {product.modifier_groups.map((g) => {
        const single = g.max_select === 1;
        return (
          <fieldset key={g.id} className="flex flex-col gap-2">
            <legend className="mb-2 flex w-full items-center justify-between gap-2">
              <span>
                <span className="block font-headline text-headline-sm">{g.name}</span>
                <span className="text-label text-on-surface-variant">
                  {single ? 'Elegí una opción' : `Elegí hasta ${g.max_select}`}
                </span>
              </span>
              {g.min_select > 0 && <span className="rounded-full bg-primary-fixed px-2.5 py-0.5 text-label font-semibold text-primary">Obligatorio</span>}
            </legend>
            <Controller
              control={control}
              name={`groups.${g.id}`}
              rules={{
                validate: (v) => (v.length >= g.min_select && v.length <= g.max_select) || (g.min_select ? `Elegí ${g.min_select === 1 ? 'una opción' : `${g.min_select} opciones`}` : `Máximo ${g.max_select}`),
              }}
              render={({ field, fieldState }) => (
                <>
                  {g.options.map((o) => {
                    const checked = field.value.includes(o.id);
                    const toggle = () => {
                      if (single) field.onChange([o.id]);
                      else if (checked) field.onChange(field.value.filter((x) => x !== o.id));
                      else if (field.value.length < g.max_select) field.onChange([...field.value, o.id]);
                    };
                    return (
                      <label key={o.id} className={cx('flex cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] p-3.5 transition', checked ? 'border-primary-container bg-primary-fixed/30' : 'border-transparent bg-surface-low')}>
                        <input type={single ? 'radio' : 'checkbox'} name={`g-${g.id}`} checked={checked} onChange={toggle} className="size-5 shrink-0 accent-primary-container" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{o.name}</span>
                          {o.description && <span className="block text-label text-on-surface-variant">{o.description}</span>}
                        </span>
                        <span className={cx('shrink-0 text-sm font-bold', o.price_delta ? 'text-primary' : 'text-on-surface-variant')}>
                          {o.price_delta ? `+${money(o.price_delta)}` : single ? 'Incluido' : ''}
                        </span>
                      </label>
                    );
                  })}
                  {fieldState.error && <p role="alert" className="text-label font-semibold text-error">{fieldState.error.message}</p>}
                </>
              )}
            />
          </fieldset>
        );
      })}
      <Textarea
        label="Notas para la cocina"
        placeholder="Ej.: salsa aparte, sin orégano, bien dorada…"
        maxLength={200}
        error={formState.errors.notes}
        {...register('notes', { maxLength: { value: 200, message: 'Máximo 200 caracteres' } })}
      />
    </div>
  );
}
