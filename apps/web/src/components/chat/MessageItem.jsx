import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { SmilePlus, MessageSquare } from 'lucide-react';
import { Avatar } from '../Avatar';
import { ApprovalCard } from './ApprovalCard';
import { ArtifactViewer } from './ArtifactViewer';
import { useAuth } from '../../context/AuthProvider';

const QUICK_EMOJIS = ['👍', '🎉', '🚀', '❤️', '👀'];

function timeOf(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessageItem({ message, onOpenThread, threadOpen, compact, onReact }) {
  const { user } = useAuth();
  const [showPicker, setShowPicker] = useState(false);
  const isAgent = message.sender?.kind === 'agent';

  return (
    <div
      className={`group flex gap-3 px-4 ${compact ? 'py-0.5' : 'py-1.5'} hover:bg-[var(--color-bg-subtle)]`}
    >
      <div className="w-8 shrink-0">
        {!compact && <Avatar name={message.sender?.name} size={32} />}
      </div>

      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="flex items-baseline gap-2">
            <span className={`text-sm font-semibold ${isAgent ? 'font-mono' : ''}`}>
              {message.sender?.name ?? 'unknown'}
            </span>
            {isAgent && (
              <span className="border border-[var(--color-border)] px-1 font-mono text-[9px] uppercase text-[var(--color-fg-muted)]">
                agent
              </span>
            )}
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">
              {timeOf(message.createdAt)}
            </span>
            {message.editedAt && (
              <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">(edited)</span>
            )}
          </div>
        )}

        <div className="prose-chat text-sm leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Task card rendered from payload (Phase 3) */}
        {message.payload?.type === 'task_card' && (
          <a
            href={`${window.location.pathname.split('/channels')[0]}/tasks`}
            className="mt-1.5 flex w-fit items-center gap-2 border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-2.5 py-1.5 text-xs hover:shadow-md"
          >
            <span className="font-mono uppercase text-[var(--color-fg-muted)]">
              ▤ task · {message.payload.status ?? 'backlog'}
            </span>
            <span className="text-[var(--color-brand)]">view board →</span>
          </a>
        )}

        {/* Approval gate card (Phase 5, improvement #3) */}
        {message.payload?.type === 'approval' && <ApprovalCard payload={message.payload} />}

        {/* Inline artifact review (Phase 5, improvement #6) */}
        {message.payload?.type === 'artifact' && <ArtifactViewer payload={message.payload} />}

        {/* Reactions */}
        {message.reactions?.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((r) => {
              const mine = user && r.reactors?.includes(user.id);
              return (
                <button
                  key={r.emoji}
                  onClick={() => onReact({ messageId: message.id, emoji: r.emoji }, mine)}
                  className={`flex items-center gap-1 border px-1.5 py-0.5 text-xs ${
                    mine
                      ? 'border-[var(--color-brand)] bg-[var(--color-bg-subtle)]'
                      : 'border-[var(--color-border)]'
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span className="font-mono">{r.count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Action bar */}
        <div className="relative mt-0.5 flex items-center gap-1 opacity-0 group-hover:opacity-100">
          {message.threadRootId === undefined && onOpenThread && (
            <button
              onClick={() => onOpenThread(message)}
              className={`flex items-center gap-1 px-1 py-0.5 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-bg)] ${
                threadOpen ? 'text-[var(--color-brand)]' : ''
              }`}
              title="Reply in thread"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {message.replyCount > 0 ? message.replyCount : 'Reply'}
            </button>
          )}
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="px-1 py-0.5 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg)]"
            title="React"
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
          {showPicker && (
            <div className="absolute bottom-6 left-0 z-10 flex gap-1 border border-[var(--color-border)] bg-[var(--color-bg)] p-1 shadow-lg">
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    onReact({ messageId: message.id, emoji: e }, false);
                    setShowPicker(false);
                  }}
                  className="p-1 text-base hover:bg-[var(--color-bg-subtle)]"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
