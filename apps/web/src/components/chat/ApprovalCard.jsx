import { ShieldCheck, ShieldAlert, Check, X, Loader2 } from 'lucide-react';
import { useDecideApproval } from '../../hooks/api';

const RISK_STYLES = {
  low: 'text-[var(--color-success)] border-[var(--color-success)]',
  medium: 'text-[var(--color-brand)] border-[var(--color-brand)]',
  high: 'text-[var(--color-danger)] border-[var(--color-danger)]',
};

/**
 * Approval gate card (improvement #3). Rendered from a message whose payload
 * type is 'approval': an agent run hit a gated action and is parked until a
 * human approves or denies. The card flips to the decision once made.
 */
export function ApprovalCard({ payload }) {
  const decide = useDecideApproval();
  const { approvalId, status, action, label, risk = 'medium' } = payload;
  const decided = ['approved', 'denied', 'cancelled'].includes(status);

  const onDecide = (decision) => decide.mutate({ approvalId, decision });

  return (
    <div className="mt-1.5 w-full max-w-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
        {decided ? (
          <ShieldCheck className="h-4 w-4 text-[var(--color-success)]" />
        ) : (
          <ShieldAlert className="h-4 w-4 text-[var(--color-brand)]" />
        )}
        <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">
          approval {status}
        </span>
        <span
          className={`ml-auto border px-1.5 font-mono text-[9px] uppercase ${RISK_STYLES[risk] || RISK_STYLES.medium}`}
        >
          {risk} risk
        </span>
      </div>

      <div className="px-3 py-2.5">
        <div className="text-sm">
          Agent wants to <span className="font-mono font-semibold">{action}</span>
        </div>
        {label && (
          <pre className="mt-1.5 overflow-x-auto border border-[var(--color-border)] bg-[var(--color-bg)] p-2 font-mono text-[11px]">
            {label}
          </pre>
        )}

        {!decided ? (
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={() => onDecide('approved')}
              disabled={decide.isPending}
              className="flex items-center gap-1 border border-[var(--color-success)] px-2.5 py-1 text-xs font-semibold text-[var(--color-success)] hover:bg-[var(--color-success)] hover:text-white disabled:opacity-50"
            >
              {decide.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Approve
            </button>
            <button
              onClick={() => onDecide('denied')}
              disabled={decide.isPending}
              className="flex items-center gap-1 border border-[var(--color-danger)] px-2.5 py-1 text-xs font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white disabled:opacity-50"
            >
              <X className="h-3 w-3" />
              Deny
            </button>
          </div>
        ) : (
          <div
            className={`mt-2 font-mono text-[11px] uppercase ${
              status === 'approved'
                ? 'text-[var(--color-success)]'
                : status === 'cancelled'
                  ? 'text-[var(--color-fg-muted)]'
                  : 'text-[var(--color-danger)]'
            }`}
          >
            {status === 'approved'
              ? '✓ approved — run resumed'
              : status === 'cancelled'
                ? '⊘ run cancelled'
                : '✗ denied — run aborted'}
          </div>
        )}
      </div>
    </div>
  );
}
