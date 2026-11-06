import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, LogOut } from 'lucide-react';
import { notify } from '../../lib/notify.js';
import { Button, Input } from '../../ui/index.jsx';
import { useAuth } from '../auth.jsx';

export const passwordRule = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .max(72, 'Máximo 72 caracteres')
  .regex(/[A-Za-zÁÉÍÓÚáéíóúÑñ]/, 'Debe incluir letras')
  .regex(/\d/, 'Debe incluir números');

const schema = z
  .object({ currentPassword: z.string().min(1, 'Requerido'), newPassword: passwordRule, confirm: z.string() })
  .refine((d) => d.newPassword === d.confirm, { message: 'Las contraseñas no coinciden', path: ['confirm'] })
  .refine((d) => d.newPassword !== d.currentPassword, { message: 'Debe ser distinta a la actual', path: ['newPassword'] });

export function ChangePasswordForm({ onDone }) {
  const { changePassword } = useAuth();
  const { register, handleSubmit, formState, reset } = useForm({ resolver: zodResolver(schema) });
  const onSubmit = handleSubmit(async (d) => {
    try {
      await changePassword(d.currentPassword, d.newPassword);
      reset();
      notify.toast('Contraseña actualizada');
      onDone?.();
    } catch (err) {
      notify.error(err);
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Input label="Contraseña actual" type="password" autoComplete="current-password" error={formState.errors.currentPassword} {...register('currentPassword')} />
      <Input label="Nueva contraseña" type="password" autoComplete="new-password" hint="Mínimo 8 caracteres, con letras y números." error={formState.errors.newPassword} {...register('newPassword')} />
      <Input label="Repetir nueva contraseña" type="password" autoComplete="new-password" error={formState.errors.confirm} {...register('confirm')} />
      <Button type="submit" icon={KeyRound} loading={formState.isSubmitting}>Guardar contraseña</Button>
    </form>
  );
}

/** Cambio obligatorio en el primer ingreso o tras un reseteo de contraseña. */
export default function ChangePasswordPage() {
  const { user, logout } = useAuth();
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <section className="card flex w-full max-w-md flex-col gap-5 p-7">
        <div>
          <p className="label-caps text-primary">Seguridad</p>
          <h1 className="font-headline text-headline-lg font-bold">Hola, {user.name.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Por seguridad tenés que definir una contraseña personal antes de continuar.</p>
        </div>
        <ChangePasswordForm />
        <Button variant="ghost" icon={LogOut} onClick={logout}>Salir</Button>
      </section>
    </main>
  );
}
