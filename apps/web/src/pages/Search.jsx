import { useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, Hash, CheckSquare, FileText } from 'lucide-react';
import { useSearch } from '../hooks/api';
import { Input } from '../components/ui/Field';

const TYPE_ICON = { message: Hash, task: CheckSquare, file: FileText };

/** Search page (PLAN.md §7.1 — Postgres FTS over messages + tasks + files). */
export function Search() {
  const { workspace } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [draft, setDraft] = useState(q);
  const { data, isFetching } = useSearch(workspace.id, q, q.length > 0);
  const items = data?.items ?? [];

  const submit = (e) => {
    e.preventDefault();
    setParams(draft.trim() ? { q: draft.trim() } : {});
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-[var(--color-border)] px-6 py-5">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <SearchIcon className="h-5 w-5" /> Search
        </h1>
        <form onSubmit={submit} className="mt-3 flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search messages, tasks, files…"
            autoFocus
            className="flex-1"
          />
          <button
            type="submit"
            className="border border-[var(--color-border)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-bg-subtle)]"
          >
            Search
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-auto">
        {!q ? (
          <div className="px-6 py-8 text-sm text-[var(--color-fg-muted)]">
            Type a query and press Enter.
          </div>
        ) : isFetching ? (
          <div className="px-6 py-8 text-sm text-[var(--color-fg-muted)]">Searching…</div>
        ) : items.length === 0 ? (
          <div className="px-6 py-8 text-sm text-[var(--color-fg-muted)]">
            No results for “{q}”.
          </div>
        ) : (
          <ul>
            {items.map((it) => {
              const Icon = TYPE_ICON[it.type] ?? SearchIcon;
              return (
                <li
                  key={`${it.type}-${it.id}`}
                  className="flex items-start gap-3 border-b border-[var(--color-border-soft)] px-6 py-3"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-fg-muted)]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {it.title ?? it.filename ?? it.preview?.slice(0, 80) ?? it.id}
                    </div>
                    {it.preview && it.type === 'message' && (
                      <div className="truncate text-xs text-[var(--color-fg-muted)]">
                        {it.preview}
                      </div>
                    )}
                    <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-fg-muted)]">
                      {it.type}
                      {it.status ? ` · ${it.status}` : ''}
                      {it.createdAt && ` · ${new Date(it.createdAt).toLocaleDateString()}`}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
