import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, LogIn, Utensils } from 'lucide-react';
import { Button, Input } from '../../ui/index.jsx';
import { useAuth } from '../auth.jsx';

const schema = z.object({
  username: z.string().trim().min(1, 'Ingresá tu usuario'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
});

/** Ingreso del personal (no hay diseño original: sigue el design system del resto del panel). */
export default function LoginPage() {
  const { login } = useAuth();
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ username, password }) => {
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
    }
  });

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-on-surface p-10 text-surface lg:flex">
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-primary-container/40 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-secondary-container/25 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-primary-container"><Utensils className="size-6" aria-hidden="true" /></span>
          <span className="font-headline text-headline-md font-bold">MesaAR · Gastro Ops</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="font-headline text-display font-bold">Salón, cocina y caja en sintonía.</h1>
          <p className="mt-3 text-surface/70">Plano en vivo, comandas al instante en cocina, cobros divididos y comprobantes listos para imprimir.</p>
        </div>
        <p className="relative text-label text-surface/50">Acceso exclusivo para personal autorizado. Las acciones quedan registradas.</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <form onSubmit={onSubmit} noValidate className="card flex w-full max-w-sm flex-col gap-5 p-7">
          <div>
            <p className="label-caps text-primary">Personal del local</p>
            <h2 className="font-headline text-headline-lg font-bold">Ingresar</h2>
          </div>
          <Input label="Usuario" autoComplete="username" autoCapitalize="none" error={formState.errors.username} {...register('username')} />
          <div className="relative">
            <Input label="Contraseña" type={show ? 'text' : 'password'} autoComplete="current-password" error={formState.errors.password} {...register('password')} />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-8 right-3 p-1 text-on-surface-variant" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              {show ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
            </button>
          </div>
          {error && <p role="alert" className="rounded-2xl bg-error-container px-4 py-3 text-sm font-semibold text-on-error-container">{error}</p>}
          <Button type="submit" size="lg" icon={LogIn} loading={formState.isSubmitting}>Ingresar</Button>
          <a href="/" className="text-center text-sm font-semibold text-primary">Ver la carta pública</a>
        </form>
      </section>
    </main>
  );
}
