import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { History, KeyRound, Pencil, Search, ShieldCheck, TrendingUp, UserPlus, UsersRound, Wallet } from 'lucide-react';
import { api } from '../../lib/api.js';
import { money, dateTimeShort, initials } from '../../lib/format.js';
import { notify } from '../../lib/notify.js';
import { useAsync } from '../../lib/hooks.js';
import { Badge, Button, Checkbox, EmptyState, Input, Modal, PageHeader, Select, Spinner, StatCard, Tabs, Toggle, cx } from '../../ui/index.jsx';
import { useAuth } from '../auth.jsx';
import { useFloor } from '../staffData.jsx';
import { passwordRule } from './ChangePasswordPage.jsx';

const baseUser = {
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(80),
  roleId: z.coerce.number().int().positive('Elegí un rol'),
  sectorId: z.union([z.literal(''), z.coerce.number().int().positive()]),
};
const createSchema = z
  .object({
    ...baseUser,
    username: z.string().trim().min(3, 'Mínimo 3 caracteres').max(40).regex(/^[a-zA-Z0-9._-]+$/, 'Solo letras, números, punto y guiones'),
    password: passwordRule,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: 'Las contraseñas no coinciden', path: ['confirm'] });
const editSchema = z.object({ ...baseUser, active: z.boolean() });

function UserForm({ user, roles, sectors, onDone }) {
  const editing = !!user;
  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(editing ? editSchema : createSchema),
    defaultValues: editing ? { name: user.name, roleId: user.role_id, sectorId: user.sector_id ?? '', active: user.active } : { name: '', username: '', password: '', confirm: '', roleId: '', sectorId: '' },
  });
  const e = formState.errors;
  const onSubmit = handleSubmit(async (d) => {
    const body = { ...d, sectorId: d.sectorId === '' ? null : d.sectorId };
    delete body.confirm;
    try {
      if (editing) await api.put(`/users/${user.id}`, body);
      else await api.post('/users', body);
      notify.toast(editing ? 'Usuario actualizado' : 'Usuario creado. Deberá cambiar la contraseña al ingresar.');
      onDone();
    } catch (err) {
      notify.error(err);
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3 sm:grid-cols-2">
      <Input label="Nombre y apellido" className="sm:col-span-2" error={e.name} {...register('name')} />
      {!editing && (
        <>
          <Input label="Usuario" autoComplete="off" error={e.username} {...register('username')} />
          <span />
          <Input label="Contraseña inicial" type="password" autoComplete="new-password" hint="Mín. 8, letras y números" error={e.password} {...register('password')} />
          <Input label="Repetir contraseña" type="password" autoComplete="new-password" error={e.confirm} {...register('confirm')} />
        </>
      )}
      <Select label="Rol" error={e.roleId} {...register('roleId')}>
        <option value="">Elegí…</option>
        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </Select>
      <Select label="Sector asignado" {...register('sectorId')}>
        <option value="">Sin sector</option>
        {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
      {editing && <Checkbox label="Usuario activo" description="Los inactivos no pueden ingresar" {...register('active')} />}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button variant="muted" onClick={onDone}>Cancelar</Button>
        <Button type="submit" loading={formState.isSubmitting}>Guardar</Button>
      </div>
    </form>
  );
}

export default function TeamPage() {
  const { can, user: me } = useAuth();
  const { data: floor } = useFloor();
  const users = useAsync(() => api.get('/users').then((r) => r.users), []);
  const roles = useAsync(() => api.get('/users/roles'), []);
  const audit = useAsync(() => (can('equipo.permisos') ? api.get('/users/audit?limit=80').then((r) => r.entries) : Promise.resolve([])), []);
  const [filter, setFilter] = useState('active');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState(null);
  const [roleTab, setRoleTab] = useState(null);
  const [showAudit, setShowAudit] = useState(false);

  if (!users.data || !roles.data) return <Spinner />;
  const list = users.data.filter((u) => (filter === 'all' || (filter === 'active' ? u.active : !u.active)) && `${u.name} ${u.username} ${u.sector_name ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const active = users.data.filter((u) => u.active);
  const salesToday = users.data.reduce((s, u) => s + u.stats.sales_today, 0);
  const tipsToday = users.data.reduce((s, u) => s + u.stats.tips_today, 0);
  const openTables = users.data.reduce((s, u) => s + u.stats.open_tables, 0);
  const currentRole = roles.data.roles.find((r) => r.id === (roleTab ?? roles.data.roles[0]?.id));
  const groups = [...new Set(roles.data.permissions.map((p) => p.grp))];

  async function resetPassword(u) {
    const pwd = await notify.prompt({
      title: `Nueva contraseña para ${u.name}`,
      label: 'Mín. 8 caracteres con letras y números. Deberá cambiarla al ingresar.',
      input: 'password',
      validator: (v) => (passwordRule.safeParse(v).success ? undefined : 'No cumple la política de contraseñas'),
    });
    if (!pwd) return;
    try {
      await api.post(`/users/${u.id}/reset-password`, { password: pwd });
      notify.toast('Contraseña restablecida');
    } catch (err) {
      notify.error(err);
    }
  }

  async function togglePerm(code, enabled) {
    try {
      const r = await api.put(`/users/roles/${currentRole.id}/permissions`, { code, enabled });
      roles.setData((d) => ({ ...d, roles: r.roles }));
      audit.reload({ silent: true });
    } catch (err) {
      notify.error(err);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Gestión de sala"
        title="Equipo, mozos y permisos"
        description="Usuarios del personal, desempeño del turno y matriz de permisos por rol."
        actions={
          <>
            {can('equipo.permisos') && <Button variant="muted" icon={History} onClick={() => setShowAudit(true)}>Auditoría y logs</Button>}
            {can('equipo.editar') && <Button icon={UserPlus} onClick={() => setEditor({})}>Nuevo usuario</Button>}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Personal activo" value={`${active.length} / ${users.data.length}`} icon={UsersRound} />
        <StatCard label="Mesas abiertas asignadas" value={openTables} hint={`${floor?.sessions.filter((s) => !s.waiter_id).length ?? 0} sin mozo`} icon={ShieldCheck} />
        <StatCard label="Ventas del día por mozos" value={money(salesToday)} icon={TrendingUp} tone="sage" />
        <StatCard label="Propinas del día" value={money(tipsToday)} icon={Wallet} tone="honey" />
      </div>

      <section className="card flex flex-col gap-4 p-4 lg:p-5" aria-labelledby="colab">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 id="colab" className="font-headline text-headline-sm font-bold">Colaboradores</h2>
          <div className="flex flex-wrap gap-2">
            <Tabs value={filter} onChange={setFilter} tabs={[{ value: 'active', label: 'Activos', count: active.length }, { value: 'inactive', label: 'Inactivos' }, { value: 'all', label: 'Todos' }]} />
            <label className="relative">
              <span className="sr-only">Buscar colaborador</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-outline" aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" className="h-11 rounded-full border-[1.5px] border-outline-variant/50 bg-surface-lowest pr-4 pl-9 text-sm outline-none focus:border-primary-container" />
            </label>
          </div>
        </div>
        {list.length === 0 && <EmptyState icon={UsersRound} title="Sin resultados" />}
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((u) => (
            <li key={u.id} className={cx('flex flex-col gap-3 rounded-card bg-surface-low p-4 sm:flex-row sm:items-center', !u.active && 'opacity-60')}>
              <div className="flex flex-1 items-center gap-3">
                <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-primary-container font-bold text-white">
                  {initials(u.name)}
                  <span className={cx('absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full ring-2 ring-surface-low', u.active ? 'bg-tertiary-container' : 'bg-outline')} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 font-headline text-headline-sm font-bold">{u.name} <Badge tone="primary">{u.role_name}</Badge></p>
                  <p className="text-label text-on-surface-variant">@{u.username} · {u.sector_name ?? 'Sin sector'} · último ingreso {u.last_login_at ? dateTimeShort(u.last_login_at) : 'nunca'}</p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 text-label sm:text-right">
                <dt className="text-on-surface-variant">Mesas hoy</dt><dd className="font-bold">{u.stats.tables_today}</dd>
                <dt className="text-on-surface-variant">Ventas hoy</dt><dd className="font-bold text-primary">{money(u.stats.sales_today)}</dd>
              </dl>
              {can('equipo.editar') && (
                <div className="flex gap-1">
                  <Button size="sm" variant="muted" icon={Pencil} onClick={() => setEditor({ user: u })}>Editar</Button>
                  {u.id !== me.id && <Button size="sm" variant="muted" icon={KeyRound} onClick={() => resetPassword(u)} aria-label={`Restablecer contraseña de ${u.name}`} />}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {currentRole && (
        <section className="card flex flex-col gap-4 p-5" aria-labelledby="matriz">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 id="matriz" className="flex items-center gap-2 font-headline text-headline-md font-bold"><ShieldCheck className="size-6 text-primary" aria-hidden="true" /> Matriz de permisos por rol</h2>
              <p className="text-sm text-on-surface-variant">Reglas de autorización para anulaciones, descuentos, caja y salón. Cada cambio queda auditado.</p>
            </div>
            <Tabs value={currentRole.id} onChange={setRoleTab} tabs={roles.data.roles.map((r) => ({ value: r.id, label: r.name }))} />
          </div>
          {currentRole.is_system && <p className="rounded-2xl bg-surface-container p-3 text-sm">El rol administrador tiene todos los permisos y no puede modificarse (evita quedar sin acceso).</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groups.map((g) => (
              <fieldset key={g} className="rounded-card bg-surface-low p-4">
                <legend className="sr-only">{g}</legend>
                <h3 className="mb-3 font-headline text-headline-sm font-bold text-primary">{g}</h3>
                <ul className="flex flex-col gap-2">
                  {roles.data.permissions.filter((p) => p.grp === g).map((p) => (
                    <li key={p.code} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-lowest p-3">
                      <span className="text-sm">{p.description}</span>
                      <Toggle checked={currentRole.permissions.includes(p.code)} label={p.description} disabled={currentRole.is_system || !can('equipo.permisos')} onChange={(v) => togglePerm(p.code, v)} />
                    </li>
                  ))}
                </ul>
              </fieldset>
            ))}
          </div>
          {audit.data?.[0] && (
            <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-container p-3 text-sm">
              <span className="size-2 rounded-full bg-tertiary-container" aria-hidden="true" /> <strong>Última acción registrada:</strong> {audit.data[0].user_name ?? 'Sistema'} · {audit.data[0].action.replaceAll('_', ' ')} · {dateTimeShort(audit.data[0].created_at)}
            </p>
          )}
        </section>
      )}

      <Modal open={!!editor} onClose={() => setEditor(null)} title={editor?.user ? `Editar ${editor.user.name}` : 'Nuevo usuario'}>
        {editor && (
          <UserForm user={editor.user} roles={roles.data.roles} sectors={floor?.sectors ?? []} onDone={() => { setEditor(null); users.reload({ silent: true }); audit.reload({ silent: true }); }} />
        )}
      </Modal>
      <Modal open={showAudit} onClose={() => setShowAudit(false)} title="Auditoría y logs" size="lg">
        <table className="w-full text-sm">
          <thead><tr className="label-caps text-left"><th className="py-2">Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>
          <tbody className="divide-y divide-outline-variant/30">
            {(audit.data ?? []).map((a) => (
              <tr key={a.id}>
                <td className="py-2 whitespace-nowrap">{dateTimeShort(a.created_at)}</td>
                <td>{a.user_name ?? '—'}</td>
                <td>{a.action.replaceAll('_', ' ')}</td>
                <td className="max-w-xs truncate text-label text-on-surface-variant" title={a.detail ? JSON.stringify(a.detail) : ''}>{a.entity}{a.entity_id ? ` #${a.entity_id}` : ''}{a.detail ? ` · ${JSON.stringify(a.detail)}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
    </div>
  );
}
