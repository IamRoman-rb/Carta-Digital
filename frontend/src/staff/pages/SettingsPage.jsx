import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, KeyRound, Pencil, Plus, Printer, QrCode, Settings2, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { toCents, toPesos } from '../../lib/format.js';
import { notify } from '../../lib/notify.js';
import { Button, Checkbox, EmptyState, IconButton, Input, PageHeader, Select, Spinner, Tabs, Textarea } from '../../ui/index.jsx';
import { useAuth } from '../auth.jsx';
import { useFloor } from '../staffData.jsx';
import { ChangePasswordForm } from './ChangePasswordPage.jsx';

const isCuit = (v) => {
  const d = String(v).replace(/\D/g, '');
  if (d.length !== 11) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let c = 11 - (w.reduce((s, x, i) => s + x * Number(d[i]), 0) % 11);
  if (c === 11) c = 0;
  if (c === 10) c = 9;
  return c === Number(d[10]);
};

const businessSchema = z.object({
  business_name: z.string().trim().min(1, 'Requerido').max(80),
  business_legal_name: z.string().trim().min(1, 'Requerido').max(120),
  cuit: z.string().refine(isCuit, 'CUIT inválido (dígito verificador)'),
  iibb: z.string().trim().max(30),
  iva_condition: z.enum(['responsable_inscripto', 'monotributo', 'exento']),
  activity_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  address: z.string().trim().min(1, 'Requerido').max(160),
  city: z.string().trim().max(80),
  phone: z.string().trim().max(40),
  email: z.union([z.email('Email inválido'), z.literal('')]),
  pos_number: z.coerce.number().int().min(1).max(99999),
  default_vat_rate: z.coerce.number(),
});

const serviceSchema = z
  .object({
    welcome_message: z.string().max(160),
    customer_ordering_enabled: z.boolean(),
    table_checkin_hours: z.coerce.number().min(0.5, 'Mínimo media hora').max(24, 'Máximo 24 horas'),
    tip_options: z.string().regex(/^\s*\d{1,2}(\s*,\s*\d{1,2}){0,5}\s*$/, 'Ej.: 0, 10, 15, 20'),
    suggested_tip: z.coerce.number().min(0).max(100),
    kds_warn_minutes: z.coerce.number().int().min(1).max(120),
    kds_late_minutes: z.coerce.number().int().min(2).max(240),
    cf_id_threshold: z.coerce.number().min(0),
    ticket_footer: z.string().max(200),
    timezone: z.string().min(3),
  })
  .refine((d) => d.kds_late_minutes > d.kds_warn_minutes, { message: 'Debe ser mayor al umbral de advertencia', path: ['kds_late_minutes'] });

function SettingsForm({ schema, defaults, children, disabled, transform = (d) => d }) {
  const { reloadSettings } = useFloor();
  const form = useForm({ resolver: zodResolver(schema), defaultValues: defaults });
  const onSubmit = form.handleSubmit(async (d) => {
    try {
      await api.put('/settings', transform(d));
      notify.toast('Ajustes guardados');
      reloadSettings({ silent: true });
    } catch (err) {
      notify.error(err);
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate className="card grid gap-4 p-5 sm:grid-cols-2">
      <fieldset disabled={disabled} className="contents">{children(form)}</fieldset>
      {!disabled && (
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" loading={form.formState.isSubmitting}>Guardar cambios</Button>
        </div>
      )}
    </form>
  );
}

function QrCard({ table, sector }) {
  const [src, setSrc] = useState(null);
  const url = `${window.location.origin}/m/${table.qr_token}`;
  useEffect(() => {
    import('qrcode').then((QR) => QR.toDataURL(url, { margin: 1, width: 240, color: { dark: '#1e1b18', light: '#ffffff' } }).then(setSrc));
  }, [url]);
  return (
    <figure className="flex break-inside-avoid flex-col items-center gap-2 rounded-card border border-outline-variant/50 bg-white p-4 text-center text-black">
      <span className="font-headline text-headline-lg leading-none font-bold">Mesa {table.number}</span>
      {src ? <img src={src} alt={`QR de la mesa ${table.number}`} className="size-40" /> : <span className="size-40" />}
      <figcaption className="text-label">
        <span className="block font-semibold">Escaneá este código para pedir desde tu celular</span>
        <span>{sector} · carta, pedido, mozo y cuenta</span>
      </figcaption>
    </figure>
  );
}

function FloorSettings() {
  const { can } = useAuth();
  const { data, reload } = useFloor();
  const [sectorFilter, setSectorFilter] = useState('');
  if (!data) return <Spinner />;
  const canEdit = can('salon.editar_plano');
  const tables = data.tables.filter((t) => !sectorFilter || t.sector_id === Number(sectorFilter));
  const sectorName = (id) => data.sectors.find((s) => s.id === id)?.name;

  async function saveSector(sector) {
    const name = await notify.prompt({ title: sector ? 'Renombrar sector' : 'Nuevo sector', inputValue: sector?.name ?? '', validator: (v) => (!v || v.trim().length < 2 ? 'Mínimo 2 caracteres' : undefined) });
    if (!name) return;
    try {
      if (sector) await api.put(`/floor/sectors/${sector.id}`, { name, sort_order: sector.sort_order, active: true });
      else await api.post('/floor/sectors', { name, sort_order: data.sectors.length, active: true });
      reload({ silent: true });
    } catch (err) {
      notify.error(err);
    }
  }
  async function removeSector(s) {
    if (!(await notify.confirm({ title: `¿Eliminar el sector ${s.name}?`, danger: true, confirmText: 'Eliminar' }))) return;
    try {
      await api.del(`/floor/sectors/${s.id}`);
      reload({ silent: true });
    } catch (err) {
      notify.error(err);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-col gap-3 p-5 no-print">
        <div className="flex items-center justify-between">
          <h2 className="font-headline text-headline-sm font-bold">Sectores del salón</h2>
          {canEdit && <Button size="sm" icon={Plus} onClick={() => saveSector(null)}>Sector</Button>}
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.sectors.filter((s) => s.active).map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-2xl bg-surface-low p-3">
              <span className="flex-1 font-semibold">{s.name}</span>
              <span className="text-label text-on-surface-variant">{data.tables.filter((t) => t.sector_id === s.id).length} mesas</span>
              {canEdit && (
                <>
                  <IconButton label={`Renombrar ${s.name}`} icon={Pencil} className="size-9" onClick={() => saveSector(s)} />
                  <IconButton label={`Eliminar ${s.name}`} icon={Trash2} className="size-9" onClick={() => removeSector(s)} />
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="text-label text-on-surface-variant">Las mesas se crean y ubican desde Plano de salón → Modo edición.</p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="no-print flex flex-wrap items-end justify-between gap-3">
          <h2 className="flex items-center gap-2 font-headline text-headline-sm font-bold"><QrCode className="size-5 text-primary" aria-hidden="true" /> Códigos QR de mesas</h2>
          <div className="flex gap-2">
            <Select aria-label="Filtrar por sector" value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)}>
              <option value="">Todos los sectores</option>
              {data.sectors.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Button icon={Printer} onClick={() => window.print()}>Imprimir</Button>
          </div>
        </div>
        {tables.length === 0 ? (
          <EmptyState icon={QrCode} title="No hay mesas" />
        ) : (
          <div className="print-area grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 print:!w-full print:grid-cols-3">
            {tables.map((t) => <QrCard key={t.id} table={t} sector={sectorName(t.sector_id)} />)}
          </div>
        )}
      </section>
    </div>
  );
}

export default function SettingsPage() {
  const { can } = useAuth();
  const { settings } = useFloor();
  const canEdit = can('ajustes.editar');
  const [tab, setTab] = useState(canEdit ? 'business' : 'account');
  const tabs = [
    ...(canEdit || settings ? [{ value: 'business', label: 'Negocio y fiscal' }, { value: 'service', label: 'Servicio y carta' }] : []),
    ...(can('salon.ver') ? [{ value: 'floor', label: 'Salón y QR' }] : []),
    { value: 'account', label: 'Mi cuenta' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Configuración" title="Ajustes POS" description={canEdit ? 'Datos del negocio usados en comprobantes, reglas de servicio y códigos QR.' : 'Solo un administrador puede modificar los ajustes del negocio.'} />
      <Tabs value={tab} onChange={setTab} tabs={tabs} className="no-print" />

      {tab === 'business' && (settings ? (
        <SettingsForm schema={businessSchema} defaults={settings} disabled={!canEdit}>
          {({ register, formState: { errors: e } }) => (
            <>
              <p className="label-caps flex items-center gap-2 sm:col-span-2"><Building2 className="size-4" aria-hidden="true" /> Emisor (RG 1415 ARCA)</p>
              <Input label="Nombre de fantasía" error={e.business_name} {...register('business_name')} />
              <Input label="Razón social" error={e.business_legal_name} {...register('business_legal_name')} />
              <Input label="CUIT" placeholder="30-12345678-9" error={e.cuit} {...register('cuit')} />
              <Select label="Condición frente al IVA" {...register('iva_condition')}>
                <option value="responsable_inscripto">Responsable Inscripto (emite A/B)</option>
                <option value="monotributo">Monotributo (emite C)</option>
                <option value="exento">Exento (emite C)</option>
              </Select>
              <Input label="Ingresos Brutos" error={e.iibb} {...register('iibb')} />
              <Input label="Inicio de actividades" type="date" error={e.activity_start} {...register('activity_start')} />
              <Input label="Domicilio comercial" error={e.address} {...register('address')} />
              <Input label="Localidad" {...register('city')} />
              <Input label="Teléfono" {...register('phone')} />
              <Input label="Email" type="email" error={e.email} {...register('email')} />
              <Input label="Punto de venta" type="number" error={e.pos_number} {...register('pos_number')} />
              <Select label="Alícuota IVA por defecto" {...register('default_vat_rate')}>
                {[21, 10.5, 27, 5, 2.5, 0].map((v) => <option key={v} value={v}>{v}%</option>)}
              </Select>
            </>
          )}
        </SettingsForm>
      ) : <Spinner />)}

      {tab === 'service' && (settings ? (
        <SettingsForm
          schema={serviceSchema}
          disabled={!canEdit}
          defaults={{ ...settings, tip_options: settings.tip_options.join(', '), cf_id_threshold: toPesos(settings.cf_id_threshold) }}
          transform={(d) => ({ ...d, tip_options: d.tip_options.split(',').map((x) => Number(x.trim())), cf_id_threshold: toCents(d.cf_id_threshold) })}
        >
          {({ register, formState: { errors: e } }) => (
            <>
              <p className="label-caps flex items-center gap-2 sm:col-span-2"><Settings2 className="size-4" aria-hidden="true" /> Carta y servicio</p>
              <Textarea label="Mensaje de bienvenida en la carta" className="sm:col-span-2" error={e.welcome_message} {...register('welcome_message')} />
              <Checkbox className="sm:col-span-2" label="Permitir pedidos desde el QR de la mesa" description="Si se desactiva, la carta queda solo de consulta y los pedidos los toma el mozo." {...register('customer_ordering_enabled')} />
              <Input
                label="Validez del escaneo de mesa (horas)"
                type="number"
                step="0.5"
                hint="Para pedir hay que escanear el QR de la mesa. El escaneo vence a este plazo o cuando la mesa se libera."
                error={e.table_checkin_hours}
                {...register('table_checkin_hours')}
              />
              <Input label="Opciones de propina (%)" hint="Separadas por coma" error={e.tip_options} {...register('tip_options')} />
              <Input label="Propina sugerida (%)" type="number" error={e.suggested_tip} {...register('suggested_tip')} />
              <Input label="Cocina: advertencia (min)" type="number" error={e.kds_warn_minutes} {...register('kds_warn_minutes')} />
              <Input label="Cocina: demora crítica (min)" type="number" error={e.kds_late_minutes} {...register('kds_late_minutes')} />
              <Input label="Monto para identificar al consumidor final ($)" type="number" hint="Según normativa ARCA vigente" error={e.cf_id_threshold} {...register('cf_id_threshold')} />
              <Input label="Zona horaria" hint="Ej.: America/Argentina/Buenos_Aires" error={e.timezone} {...register('timezone')} />
              <Input label="Pie del ticket" className="sm:col-span-2" error={e.ticket_footer} {...register('ticket_footer')} />
            </>
          )}
        </SettingsForm>
      ) : <Spinner />)}

      {tab === 'floor' && <FloorSettings />}

      {tab === 'account' && (
        <section className="card max-w-md p-5">
          <h2 className="mb-4 flex items-center gap-2 font-headline text-headline-sm font-bold"><KeyRound className="size-5 text-primary" aria-hidden="true" /> Cambiar mi contraseña</h2>
          <ChangePasswordForm />
        </section>
      )}
    </div>
  );
}
