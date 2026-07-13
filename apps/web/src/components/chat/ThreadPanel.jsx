import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { MessageItem } from './MessageItem';
import { Composer } from './Composer';
import { useThread, useSendMessage } from '../../hooks/api';

export function ThreadPanel({ workspaceId, channelId, rootMessage, onReact, onClose }) {
  const thread = useThread(rootMessage.id, true);
  const send = useSendMessage(channelId);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.data?.items?.length]);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-bg)] lg:w-96">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-fg-muted)]">
            Thread
          </div>
          <div className="truncate text-sm font-semibold">{rootMessage.content.slice(0, 60)}</div>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-subtle)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <MessageItem message={rootMessage} onReact={onReact} />
        <div className="my-2 px-4">
          <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-fg-muted)]">
            {thread.data?.items?.length ?? 0} replies
          </span>
        </div>
        {(thread.data?.items ?? []).map((m) => (
          <MessageItem key={m.id} message={m} onReact={onReact} />
        ))}
        <div ref={bottomRef} />
      </div>

      <Composer
        workspaceId={workspaceId}
        channelId={channelId}
        threadRootId={rootMessage.id}
        onSend={(body) => send.mutateAsync(body).then(() => thread.refetch())}
      />
    </aside>
  );
}
