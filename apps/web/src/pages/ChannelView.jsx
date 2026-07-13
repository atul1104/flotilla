import { useEffect, useState, useRef } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { Hash, Users } from 'lucide-react';
import { MessageList } from '../components/chat/MessageList';
import { Composer } from '../components/chat/Composer';
import { ThreadPanel } from '../components/chat/ThreadPanel';
import { useMessages, useSendMessage, useReact, useChannels } from '../hooks/api';
import { api } from '../lib/api';

export function ChannelView() {
  const { workspace } = useOutletContext();
  const { channelId } = useParams();
  const channels = useChannels(workspace.id);
  const messages = useMessages(channelId);
  const send = useSendMessage(channelId);
  const react = useReact(channelId);
  const [threadRoot, setThreadRoot] = useState(null);
  const [typing, setTyping] = useState([]);
  const readTimer = useRef(null);

  const channel = channels.data?.items?.find((c) => c.id === channelId);
  const Icon = channel?.kind === 'dm' ? Users : Hash;

  // Mark the channel read shortly after viewing (cursor = newest message id).
  useEffect(() => {
    if (!channelId) return;
    const newest = messages.data?.pages?.[0]?.items?.[0];
    if (!newest) return;
    clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      api.post(`/channels/${channelId}/read`, { messageId: newest.id }).catch(() => {});
    }, 800);
    return () => clearTimeout(readTimer.current);
  }, [channelId, messages.data?.pages?.[0]?.items?.[0]?.id]);

  // Typing indicator via the DOM event bus.
  useEffect(() => {
    const handler = (e) => {
      if (e.detail.channelId !== channelId) return;
      setTyping((t) => [...t.filter((x) => x.name !== e.detail.name), { name: e.detail.name }]);
      setTimeout(() => setTyping((t) => t.filter((x) => x.name !== e.detail.name)), 3500);
    };
    window.addEventListener('flotilla:typing', handler);
    return () => window.removeEventListener('flotilla:typing', handler);
  }, [channelId]);

  const doReact = ({ messageId, emoji }, mine) =>
    mine ? react.remove.mutate({ messageId, emoji }) : react.add.mutate({ messageId, emoji });

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <Icon className="h-4 w-4 shrink-0 text-[var(--color-fg-muted)]" />
          <span className="font-mono text-sm font-semibold">{channel?.name ?? channelId}</span>
          {channel?.topic && (
            <span className="truncate border-l border-[var(--color-border)] pl-2 text-xs text-[var(--color-fg-muted)]">
              {channel.topic}
            </span>
          )}
        </header>

        <MessageList
          messagesData={messages.data}
          onOpenThread={(m) => setThreadRoot(m)}
          onReact={doReact}
          isFetchingOlder={messages.isFetchingNextPage}
          onLoadOlder={() => messages.fetchNextPage()}
        />

        {typing.length > 0 && (
          <div className="border-t border-[var(--color-border-soft)] px-4 py-1 font-mono text-[11px] text-[var(--color-fg-muted)]">
            {typing.map((t) => t.name).join(', ')} {typing.length === 1 ? 'is' : 'are'} typing…
          </div>
        )}

        <Composer
          workspaceId={workspace.id}
          channelId={channelId}
          onSend={(body) => send.mutateAsync(body)}
        />
      </div>

      {threadRoot && (
        <ThreadPanel
          workspaceId={workspace.id}
          channelId={channelId}
          rootMessage={threadRoot}
          onReact={doReact}
          onClose={() => setThreadRoot(null)}
        />
      )}
    </div>
  );
}
