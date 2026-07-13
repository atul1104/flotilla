/** Brutalist button: sharp corners, 1px border, press offset. */
const VARIANTS = {
  primary:
    'bg-[var(--color-accent)] text-[var(--color-accent-fg)] border-[var(--color-accent)] hover:opacity-90',
  secondary:
    'bg-transparent text-[var(--color-fg)] border-[var(--color-border)] hover:bg-[var(--color-bg-subtle)]',
  danger: 'bg-[var(--color-danger)] text-white border-[var(--color-danger)] hover:opacity-90',
  ghost:
    'bg-transparent text-[var(--color-fg)] border-transparent hover:bg-[var(--color-bg-subtle)]',
};

const SIZES = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3.5 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  loading = false,
  disabled,
  children,
  ...props
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 border font-medium transition-[transform,opacity,background] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
