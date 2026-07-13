import { useOutletContext } from 'react-router-dom';
import { Activity as ActivityIcon, RotateCcw } from 'lucide-react';
import { useWorkspaceRuns, useRetryRun } from '../hooks/api';
import { Button } from '../components/ui/Button';

const STATUS_TONE = {
  succeeded: 'text-[var(--color-success)]',
  failed: 'text-[var(--color-danger)]',
  cancelled: 'text-[var(--color-fg-muted)]',
  queued: 'text-[var(--color-fg-muted)]',
  running: 'text-[var(--color-brand)]',
  dispatched: 'text-[var(--color-brand)]',
  awaiting_approval: 'text-[var(--color-brand)]',
};

function fmtTokens(n) {
  const t = Number(n ?? 0);
  if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(1)}M`;
  if (t >= 1_000) return `${(t / 1_000).toFixed(1)}k`;
  return String(t);
}

/** Cross-workspace run feed (PLAN.md §9.1 — /activity). */
export function Activity() {
  const { workspace } = useOutletContext();
  const { data, isLoading } = useWorkspaceRuns(workspace.id);
  const retry = useRetryRun();
  const runs = data?.items ?? [];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-[var(--color-border)] px-6 py-5">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ActivityIcon className="h-5 w-5" /> Activity
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">Recent agent runs in this workspace.</p>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="px-6 py-8 text-sm text-[var(--color-fg-muted)]">Loading…</div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-sm text-[var(--color-fg-muted)]">
            <ActivityIcon className="h-6 w-6" />
            No runs yet. @mention an agent to start one.
          </div>
        ) : (
          <ul>
            {runs.map((r) => {
              const agent = r.agent ?? {};
              const finished = ['succeeded', 'failed', 'cancelled'].includes(r.status);
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-3 border-b border-[var(--color-border-soft)] px-6 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{agent.name ?? 'Agent'}</span>
                      {agent.handle && (
                        <span className="font-mono text-xs text-[var(--color-fg-muted)]">
                          @{agent.handle}
                        </span>
                      )}
                      <span className={`font-mono text-xs ${STATUS_TONE[r.status] ?? ''}`}>
                        {r.status}
                      </span>
                      {r.trigger && (
                        <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">
                          [{r.trigger}]
                        </span>
                      )}
                      {r.chainDepth > 0 && (
                        <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">
                          depth {r.chainDepth}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-[var(--color-fg-muted)]">
                      {new Date(r.queuedAt).toLocaleString()}
                      {r.tokensIn + r.tokensOut > 0 &&
                        ` · ${fmtTokens(r.tokensIn)} in / ${fmtTokens(r.tokensOut)} out`}
                      {r.error && ` · ${r.error}`}
                    </div>
                  </div>
                  {finished && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => retry.mutate(r.id)}
                      title="Retry run"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
