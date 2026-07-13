import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, Check } from 'lucide-react';
import { useNotifications, useMarkNotificationsRead } from '../../hooks/api';

const TYPE_ICON = { approval: '🔐', mention: '@', run_finished: '✓', task_assigned: '▤' };

/** Bell with unread badge + dropdown of recent notifications (Phase 6). */
export function NotificationBell({ workspaceSlug }) {
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        title="Notifications"
      >
        {unread > 0 ? (
          <BellRing className="h-4 w-4 text-[var(--color-brand)]" />
        ) : (
          <Bell className="h-4 w-4" />
        )}
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center bg-[var(--color-danger)] px-0.5 font-mono text-[8px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-80 border border-[var(--color-border)] bg-[var(--color-bg)] shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-fg-muted)]">
              {unread} unread
            </span>
            <button
              onClick={() => markRead.mutate()}
              className="flex items-center gap-1 text-[10px] text-[var(--color-brand)] hover:underline"
            >
              <Check className="h-3 w-3" /> Mark all read
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-[var(--color-fg-muted)]">
                No notifications yet.
              </li>
            )}
            {items.slice(0, 8).map((n) => (
              <li
                key={n.id}
                className={`border-b border-[var(--color-border-soft)] px-3 py-2 text-xs ${
                  n.readAt ? 'opacity-60' : 'bg-[var(--color-bg-subtle)]'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span>{TYPE_ICON[n.type] ?? '•'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{n.payload?.title || n.type}</div>
                    {n.payload?.preview && (
                      <div className="truncate text-[var(--color-fg-muted)]">
                        {n.payload.preview}
                      </div>
                    )}
                  </div>
                  {!n.readAt && (
                    <button
                      onClick={() => markRead.mutate([n.id])}
                      className="text-[var(--color-fg-muted)] hover:text-[var(--color-brand)]"
                      title="Mark read"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              setOpen(false);
              navigate(`/${workspaceSlug}/notifications`);
            }}
            className="block w-full border-t border-[var(--color-border)] px-3 py-2 text-center text-[10px] font-mono uppercase text-[var(--color-brand)] hover:bg-[var(--color-bg-subtle)]"
          >
            View all →
          </button>
        </div>
      )}
    </div>
  );
}
