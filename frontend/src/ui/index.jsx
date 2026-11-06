import { useEffect, useId, useRef } from 'react';
import { Loader2, Minus, Plus, X } from 'lucide-react';

const cx = (...c) => c.filter(Boolean).join(' ');
export { cx };

const VARIANTS = {
  primary: 'bg-primary-container text-white hover:bg-primary hover:shadow-glow hover:-translate-y-px',
  dark: 'bg-on-surface text-surface hover:bg-inverse-surface',
  secondary: 'border-[1.5px] border-on-surface text-on-surface hover:bg-surface-container',
  soft: 'bg-primary-fixed text-on-primary-fixed hover:bg-primary-fixed-dim',
  ghost: 'text-primary hover:bg-primary-fixed/50',
  muted: 'bg-surface-container text-on-surface hover:bg-surface-high',
  danger: 'bg-error text-white hover:brightness-110',
  success: 'bg-tertiary text-white hover:bg-tertiary-container',
};
const SIZES = { sm: 'h-9 px-4 text-sm', md: 'h-11 px-5 text-sm', lg: 'h-14 px-7 text-base' };

export function Button({ variant = 'primary', size = 'md', loading = false, icon: Icon, className, children, disabled, type = 'button', ...props }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : Icon && <Icon className="size-[18px] shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function IconButton({ label, icon: Icon, className, variant = 'muted', ...props }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('inline-flex size-11 shrink-0 items-center justify-center rounded-full transition active:scale-95', VARIANTS[variant], className)} {...props}>
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}

export function Chip({ active, children, className, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition',
        active ? 'border-on-surface bg-on-surface text-surface' : 'border-outline-variant/60 bg-surface-lowest text-on-surface hover:bg-surface-container',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({ tone = 'neutral', children, className }) {
  const tones = {
    neutral: 'bg-surface-high text-on-surface-variant',
    primary: 'bg-primary-fixed text-primary',
    honey: 'bg-secondary-container text-on-secondary-container',
    sage: 'bg-tertiary-fixed/70 text-tertiary',
    danger: 'bg-error-container text-on-error-container',
    dark: 'bg-on-surface text-surface',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-label font-semibold', tones[tone], className)}>{children}</span>;
}

export function Spinner({ label = 'Cargando…', className }) {
  return (
    <div role="status" className={cx('flex items-center justify-center gap-2 p-8 text-on-surface-variant', className)}>
      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card bg-surface-low p-8 text-center">
      {Icon && <Icon className="size-10 text-outline" aria-hidden="true" />}
      <p className="font-headline text-headline-sm">{title}</p>
      {text && <p className="max-w-sm text-sm text-on-surface-variant">{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-card bg-error-container/60 p-6 text-center text-on-error-container">
      <p className="font-semibold">{error?.message ?? 'Ocurrió un error'}</p>
      {onRetry && (
        <Button variant="dark" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled, className }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-40', checked ? 'bg-tertiary-container' : 'bg-outline/40', className)}
    >
      <span className={cx('inline-block size-5 rounded-full bg-white shadow transition', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  );
}

export function QuantityStepper({ value, onChange, min = 1, max = 50, size = 'md' }) {
  const s = size === 'sm' ? 'size-8' : 'size-10';
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-surface-container p-1" role="group" aria-label="Cantidad">
      <button type="button" className={cx(s, 'grid place-items-center rounded-full bg-surface-lowest shadow-base disabled:opacity-40')} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Restar uno">
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <output className="w-8 text-center font-bold" aria-live="polite">{value}</output>
      <button type="button" className={cx(s, 'grid place-items-center rounded-full bg-surface-lowest shadow-base disabled:opacity-40')} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Sumar uno">
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Modal accesible basado en <dialog> nativo (foco y Escape gestionados por el navegador). */
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cx('m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] overflow-hidden rounded-card-lg bg-surface p-0 text-on-surface shadow-overlay', widths[size])}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-outline-variant/40 px-5 py-4">
            <h2 id={titleId} className="font-headline text-headline-sm">{title}</h2>
            <IconButton label="Cerrar" icon={X} onClick={onClose} className="size-9" />
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-outline-variant/40 px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'neutral', className }) {
  const tones = {
    neutral: 'bg-surface-lowest',
    alert: 'bg-error-container/70 ring-1 ring-error/30',
    honey: 'bg-secondary-fixed/60',
    sage: 'bg-tertiary-fixed/30',
  };
  const iconTones = { neutral: 'bg-surface-container text-on-surface-variant', alert: 'bg-error text-white', honey: 'bg-secondary-container text-on-secondary-container', sage: 'bg-tertiary-fixed text-tertiary' };
  return (
    <div className={cx('flex items-start justify-between gap-3 rounded-card p-4 shadow-base', tones[tone], className)}>
      <div className="min-w-0">
        <p className="label-caps">{label}</p>
        <p className="mt-1 truncate font-headline text-headline-md font-bold">{value}</p>
        {hint && <p className="mt-0.5 text-label text-on-surface-variant">{hint}</p>}
      </div>
      {Icon && (
        <span className={cx('grid size-10 shrink-0 place-items-center rounded-full', iconTones[tone])}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
      )}
    </div>
  );
}

// ---------- Campos de formulario (compatibles con react-hook-form) ----------
export function Field({ label, error, hint, children, className, htmlFor }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-label font-semibold text-on-surface-variant">
          {label}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-label text-on-surface-variant/80">{hint}</p>}
      {error && (
        <p role="alert" className="text-label font-semibold text-error">
          {error.message ?? error}
        </p>
      )}
    </div>
  );
}

const inputCls = 'h-11 w-full rounded-2xl border-[1.5px] border-outline-variant/60 bg-surface-lowest px-4 text-sm outline-none transition focus:border-primary-container aria-[invalid=true]:border-error';

export function Input({ label, error, hint, className, id, ...props }) {
  const autoId = useId();
  const fid = id ?? autoId;
  return (
    <Field label={label} error={error} hint={hint} className={className} htmlFor={fid}>
      <input id={fid} aria-invalid={!!error} className={inputCls} {...props} />
    </Field>
  );
}

export function Select({ label, error, hint, className, children, id, ...props }) {
  const autoId = useId();
  const fid = id ?? autoId;
  return (
    <Field label={label} error={error} hint={hint} className={className} htmlFor={fid}>
      <select id={fid} aria-invalid={!!error} className={inputCls} {...props}>
        {children}
      </select>
    </Field>
  );
}

export function Textarea({ label, error, hint, className, id, ...props }) {
  const autoId = useId();
  const fid = id ?? autoId;
  return (
    <Field label={label} error={error} hint={hint} className={className} htmlFor={fid}>
      <textarea id={fid} aria-invalid={!!error} className={cx(inputCls, 'h-auto min-h-24 py-3')} {...props} />
    </Field>
  );
}

export function Checkbox({ label, description, className, ...props }) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-3', className)}>
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary-container" {...props} />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {description && <span className="block text-label text-on-surface-variant">{description}</span>}
      </span>
    </label>
  );
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="label-caps text-primary">{eyebrow}</p>}
        <h1 className="mt-1 font-headline text-headline-lg font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div role="tablist" className={cx('scrollbar-none flex gap-1 overflow-x-auto rounded-full bg-surface-container p-1', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx('inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition', value === t.value ? 'bg-on-surface text-surface shadow' : 'text-on-surface-variant hover:bg-surface-high')}
        >
          {t.label}
          {t.count != null && <span className={cx('rounded-full px-1.5 text-micro', value === t.value ? 'bg-surface/20' : 'bg-surface-high')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
