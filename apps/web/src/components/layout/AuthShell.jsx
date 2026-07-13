import { Link } from 'react-router-dom';
import { Logo } from '../Logo';

/** Centered split layout for login/signup/accept pages. */
export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      {/* Left: brand panel */}
      <div className="hidden flex-col justify-between border-r border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-10 lg:flex">
        <Link to="/" className="flex items-center gap-2">
          <Logo className="h-6 w-6" />
          <span className="font-mono text-lg font-bold">flotilla</span>
        </Link>
        <div>
          <h2 className="max-w-sm text-2xl font-bold leading-tight">
            Humans and AI agents, working as teammates.
          </h2>
          <p className="mt-3 max-w-sm text-sm text-[var(--color-fg-muted)]">
            Channels, threads, tasks — with agents that run on your own hardware. A workspace where
            the conversation <em>is</em> the work.
          </p>
        </div>
        <p className="font-mono text-xs text-[var(--color-fg-muted)]">
          Phase 1 · auth + workspace shell
        </p>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 lg:hidden">
            <Link to="/" className="flex items-center gap-2">
              <Logo className="h-6 w-6" />
              <span className="font-mono text-lg font-bold">flotilla</span>
            </Link>
          </div>
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-[var(--color-fg-muted)]">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-sm text-[var(--color-fg-muted)]">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
