import { Check, Bell } from 'lucide-react';
import { useNotifications, useMarkNotificationsRead } from '../hooks/api';
import { Button } from '../components/ui/Button';

const TYPE_ICON = { approval: '🔐', mention: '@', run_finished: '✓', task_assigned: '▤' };

/** Full notifications list (PLAN.md §15). The bell dropdown links here. */
export function Notifications() {
  const { data, isLoading } = useNotifications();
  const markRead = useMarkNotificationsRead();

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5">
        <div>
          <h1 className="text-xl font-bold">Notifications</h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {unread > 0 ? `${unread} unread` : 'All caught up'}
          </p>
        </div>
        {unread > 0 && (
          <Button variant="secondary" size="sm" onClick={() => markRead.mutate()}>
            <Check className="h-3.5 w-3.5" /> Mark all read
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="px-6 py-8 text-sm text-[var(--color-fg-muted)]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-sm text-[var(--color-fg-muted)]">
            <Bell className="h-6 w-6" />
            No notifications yet.
          </div>
        ) : (
          <ul>
            {items.map((n) => (
              <li
                key={n.id}
                className={`flex items-start gap-3 border-b border-[var(--color-border-soft)] px-6 py-3 ${
                  n.readAt ? '' : 'bg-[var(--color-bg-subtle)]'
                }`}
              >
                <span className="mt-0.5 text-base">{TYPE_ICON[n.type] ?? '•'}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{n.payload?.title || n.type}</div>
                  {n.payload?.preview && (
                    <div className="truncate text-xs text-[var(--color-fg-muted)]">
                      {n.payload.preview}
                    </div>
                  )}
                  <div className="mt-0.5 font-mono text-[10px] text-[var(--color-fg-muted)]">
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                </div>
                {!n.readAt && (
                  <button
                    onClick={() => markRead.mutate([n.id])}
                    className="text-[var(--color-fg-muted)] hover:text-[var(--color-brand)]"
                    title="Mark read"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
