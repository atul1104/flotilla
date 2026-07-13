import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon, CornerDownLeft } from 'lucide-react';
import { useSearch } from '../../hooks/api';

/**
 * Cmd-K search bar (PLAN.md §9.1). Mounts in the app top bar; opens a palette
 * overlay on ⌘K / Ctrl+K. Results link to the search page for the full list.
 */
export function SearchBar({ workspace }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { data } = useSearch(workspace.id, q, open && q.length > 1);
  const items = (data?.items ?? []).slice(0, 6);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const goFull = () => {
    if (!q.trim()) return;
    setOpen(false);
    navigate(`/${workspace.slug}/search?q=${encodeURIComponent(q.trim())}`);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-subtle)]"
        title="Search (⌘K)"
      >
        <SearchIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="ml-2 hidden font-mono text-[10px] sm:inline">⌘K</kbd>
      </button>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 border border-[var(--color-brand)] bg-[var(--color-bg)] px-3 py-1.5">
        <SearchIcon className="h-4 w-4 text-[var(--color-fg-muted)]" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') goFull();
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Search messages, tasks, files…"
          className="w-64 bg-transparent text-sm focus:outline-none"
        />
        <kbd className="font-mono text-[10px] text-[var(--color-fg-muted)]">esc</kbd>
      </div>
      {items.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 border border-[var(--color-border)] bg-[var(--color-bg)] shadow-lg">
          {items.map((it) => (
            <li key={`${it.type}-${it.id}`}>
              <button
                onClick={goFull}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-bg-subtle)]"
              >
                <span className="font-mono text-[10px] uppercase text-[var(--color-fg-muted)]">
                  {it.type}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {it.title ?? it.filename ?? it.preview ?? it.id}
                </span>
                <CornerDownLeft className="h-3 w-3 text-[var(--color-fg-muted)]" />
              </button>
            </li>
          ))}
          <li>
            <button
              onClick={goFull}
              className="block w-full border-t border-[var(--color-border)] px-3 py-2 text-center font-mono text-[10px] uppercase text-[var(--color-brand)] hover:bg-[var(--color-bg-subtle)]"
            >
              See all results →
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
