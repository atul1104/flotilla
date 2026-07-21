import { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button, Spinner } from '../ui/Button';
import { MessageItem } from './MessageItem';

// Virtualized message list (PLAN.md §9.2, Phase 8 hardening). Windowed via
// @tanstack/react-virtual with dynamic measurement so variable-height messages
// (markdown, artifacts, approval cards) render correctly. Day dividers are
// folded into the virtualized row stream as sticky-less separators.

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yest)) return 'Yesterday';
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

export function MessageList({ messagesData, onOpenThread, onReact, isFetchingOlder, onLoadOlder }) {
  const scrollRef = useRef(null);
  const atBottomRef = useRef(true);

  // pages[0] is newest; each page's items are newest-first. Chronological order:
  const items = useMemo(() => {
    if (!messagesData) return [];
    return [...messagesData.pages].reverse().flatMap((p) => [...p.items].reverse());
  }, [messagesData]);

  // Build a flat row stream: day dividers interleaved with message rows.
  // Each row is { type: 'day'|'msg', id, message?, compact?, day? }.
  const rows = useMemo(() => {
    const out = [];
    let lastDay = null;
    for (let i = 0; i < items.length; i++) {
      const m = items[i];
      const prev = items[i - 1];
      const label = dayLabel(m.createdAt);
      if (label !== lastDay) {
        out.push({ type: 'day', id: `day-${label}-${i}`, day: label });
        lastDay = label;
      }
      const compact =
        prev &&
        prev.sender?.id === m.sender?.id &&
        new Date(m.createdAt) - new Date(prev.createdAt) < 5 * 60 * 1000 &&
        !!prev.threadRootId === !!m.threadRootId;
      out.push({ type: 'msg', id: m.id, message: m, compact });
    }
    return out;
  }, [items]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i]?.type === 'day' ? 32 : 80),
    overscan: 8,
    // No custom measureElement: the library default reads borderBoxSize via
    // ResizeObserver, which re-measures on resize. The previous override used
    // getBoundingClientRect().height, which excludes margins — day dividers
    // (my-2) were measured ~16px too short, so the next message overlapped
    // them and drift accumulated across day boundaries (most visible in
    // long channels like #general). Rows below use padding, not margin, so
    // their full height is captured.
  });

  // Auto-scroll to bottom when the channel opens or new messages arrive (if the
  // user is at the bottom). Deferred a frame + uses the virtualizer's scrollToIndex
  // so it lands on the newest row even before dynamic row measurement completes —
  // a synchronous scrollTop=scrollHeight lands short because the virtualizer hasn't
  // measured yet, so opening a channel showed the oldest messages instead.
  const newestId = rows[rows.length - 1]?.id;
  useEffect(() => {
    if (!atBottomRef.current || rows.length === 0) return;
    const raf = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(rows.length - 1, { align: 'end' });
    });
    return () => cancelAnimationFrame(raf);
  }, [newestId, rows.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  return (
    <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
      <div className="flex justify-center p-3">
        {isFetchingOlder ? (
          <Spinner className="h-4 w-4 text-[var(--color-fg-muted)]" />
        ) : messagesData?.hasNextPage ? (
          <Button variant="ghost" size="sm" onClick={onLoadOlder}>
            Load older messages
          </Button>
        ) : (
          <span className="font-mono text-xs text-[var(--color-fg-muted)]">start of channel</span>
        )}
      </div>

      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <div
              key={row.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {row.type === 'day' ? (
                <div className="flex items-center gap-3 px-4 py-2">
                  <div className="h-px flex-1 bg-[var(--color-border-soft)]" />
                  <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-fg-muted)]">
                    {row.day}
                  </span>
                  <div className="h-px flex-1 bg-[var(--color-border-soft)]" />
                </div>
              ) : (
                <MessageItem
                  message={row.message}
                  compact={row.compact}
                  onOpenThread={onOpenThread}
                  onReact={onReact}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="h-4" />
    </div>
  );
}
