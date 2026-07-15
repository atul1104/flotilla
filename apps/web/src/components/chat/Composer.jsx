import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useMembers } from '../../hooks/api';
import { useAuth } from '../../context/AuthProvider';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { CLIENT_SOCKET_EVENTS } from '@atul1104/shared';

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export function Composer({ workspaceId, channelId, onSend, threadRootId }) {
  const { user } = useAuth();
  const members = useMembers(workspaceId);
  const [text, setText] = useState('');
  const [pending, setPending] = useState([]); // uploads in flight
  const [attachments, setAttachments] = useState([]); // uploaded attachmentIds
  const [mention, setMention] = useState(null); // {start, query}
  const taRef = useRef(null);
  const lastTyping = useRef(0);

  const me = members.data?.items?.find((m) => m.userId === user?.id);

  const emitTyping = () => {
    const now = Date.now();
    if (now - lastTyping.current > 2500) {
      lastTyping.current = now;
      getSocket()?.emit(CLIENT_SOCKET_EVENTS.TYPING_START, { channelId });
    }
  };

  const onChange = (e) => {
    const val = e.target.value;
    setText(val);
    emitTyping();
    // Detect @mention at caret.
    const caret = e.target.selectionStart;
    const before = val.slice(0, caret);
    const match = before.match(/(?:^|\s)@([a-z0-9_.-]*)$/i);
    if (match) setMention({ start: caret - match[1].length, query: match[1] });
    else setMention(null);
  };

  const matches = mention
    ? (members.data?.items ?? [])
        .filter((m) => m.userId !== user?.id)
        .filter((m) => {
          // Agents resolve by @handle; humans by name. Match either field.
          const n = norm(m.name);
          const h = m.kind === 'agent' && m.handle ? norm(m.handle) : null;
          const q = norm(mention.query);
          return n.includes(q) || n.startsWith(q) || (h && (h.includes(q) || h.startsWith(q)));
        })
        .slice(0, 6)
    : [];

  const pickMention = (m) => {
    // Agents are @mentioned by handle (server resolution); humans by name.
    const token = `@${m.kind === 'agent' && m.handle ? m.handle : norm(m.name)} `;
    const before = text.slice(0, mention.start);
    const after = text.slice(taRef.current.selectionStart);
    const next = `${before}${token}${after}`;
    setText(next);
    setMention(null);
    taRef.current.focus();
    requestAnimationFrame(() => {
      const pos = (before + token).length;
      taRef.current.setSelectionRange(pos, pos);
    });
  };

  const onDrop = async (e) => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files ?? [])];
    for (const file of files) {
      const key = `${file.name}-${file.size}`;
      setPending((p) => [...p, key]);
      try {
        const presign = await api.post(`/workspaces/${workspaceId}/uploads/presign`, {
          filename: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
        });
        await fetch(presign.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'content-type': presign.headers['content-type'] },
        });
        setAttachments((a) => [...a, { id: presign.attachmentId, filename: file.name }]);
      } catch {
        // surfaced inline below
      } finally {
        setPending((p) => p.filter((k) => k !== key));
      }
    }
  };

  const send = () => {
    const content = text.trim();
    if (!content && attachments.length === 0) return;
    onSend({
      content,
      attachmentIds: attachments.map((a) => a.id),
      threadRootId,
      clientNonce: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    setText('');
    setAttachments([]);
    setMention(null);
  };

  const onKeyDown = (e) => {
    if (mention && matches.length && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault();
      pickMention(matches[0]);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  useEffect(() => {
    // auto-grow
    const ta = taRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, [text]);

  return (
    <div className="relative border-t border-[var(--color-border)] p-3">
      {mention && matches.length > 0 && (
        <div className="absolute bottom-full left-3 mb-1 w-64 border border-[var(--color-border)] bg-[var(--color-bg)] shadow-lg">
          {matches.map((m) => (
            <button
              key={m.actorId}
              onClick={() => pickMention(m)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-bg-subtle)]"
            >
              <span className="h-6 w-6 shrink-0 border border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-center font-mono text-xs leading-6">
                {(m.name || '?').charAt(0)}
              </span>
              <span className="truncate">{m.name}</span>
              {m.kind === 'agent' && m.handle ? (
                <span className="ml-auto truncate font-mono text-[10px] text-[var(--color-fg-muted)]">
                  @{m.handle}
                </span>
              ) : m.email ? (
                <span className="ml-auto truncate font-mono text-[10px] text-[var(--color-fg-muted)]">
                  @{norm(m.name)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <span
              key={a.id}
              className="flex items-center gap-1 border border-[var(--color-border)] px-2 py-1 text-xs"
            >
              <Paperclip className="h-3 w-3" />
              {a.filename}
              <button
                onClick={() => setAttachments((arr) => arr.filter((x) => x.id !== a.id))}
                className="text-[var(--color-fg-muted)] hover:text-[var(--color-danger)]"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <label
          className="cursor-pointer p-2 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-subtle)]"
          title="Attach"
        >
          <Paperclip className="h-4 w-4" />
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) =>
              onDrop({ preventDefault() {}, dataTransfer: { files: e.target.files } })
            }
          />
        </label>
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          placeholder={threadRootId ? 'Reply in thread…' : `Message${me ? '' : ''}…`}
          className="max-h-48 flex-1 resize-none border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:outline-none"
        />
        <Button
          onClick={send}
          disabled={pending.length > 0 || (!text.trim() && attachments.length === 0)}
        >
          {pending.length > 0 ? 'Uploading…' : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
