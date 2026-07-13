import { useId } from 'react';

export function Field({ label, error, hint, className = '', children }) {
  const id = useId();
  return (
    <label htmlFor={id} className={`block ${className}`}>
      {label && (
        <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
          {label}
        </span>
      )}
      {children}
      {hint && !error && (
        <span className="mt-1 block text-xs text-[var(--color-fg-muted)]">{hint}</span>
      )}
      {error && <span className="mt-1 block text-xs text-[var(--color-danger)]">{error}</span>}
    </label>
  );
}

export function Input({ invalid, className = '', ...props }) {
  return (
    <input
      className={`w-full border bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-muted)] focus:outline-none ${
        invalid ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)]'
      } ${className}`}
      {...props}
    />
  );
}

export function Alert({ kind = 'info', children }) {
  const color =
    kind === 'error'
      ? 'border-[var(--color-danger)] text-[var(--color-danger)]'
      : kind === 'success'
        ? 'border-[var(--color-success)] text-[var(--color-success)]'
        : 'border-[var(--color-border)] text-[var(--color-fg)]';
  return (
    <div className={`border bg-[var(--color-bg-subtle)] px-3 py-2 text-sm ${color}`}>
      {children}
    </div>
  );
}
