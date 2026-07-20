import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { CLIENT_SOCKET_EVENTS as E } from '@atul1104/shared';

/**
 * Connects the /client socket while authenticated and patches the TanStack
 * Query cache from realtime events (PLAN.md §9.3). Typed inserts keep messages
 * newest-first within each page.
 */
export function RealtimeProvider({ children }) {
  const qc = useQueryClient();

  useEffect(() => {
    const socket = connectSocket();

    // Insert a message into the right cache: top-level messages go in the
    // channel's ['messages', channelId] (infinite) cache; threaded replies go
    // in ['thread', threadRootId]. Routing both into the channel cache caused
    // threaded agent replies to flash in then vanish on the next refetch (which
    // only returns top-level messages).
    const upsertMessage = (channelId, message) => {
      if (message.threadRootId) {
        qc.setQueriesData({ queryKey: ['thread', message.threadRootId] }, (old) => {
          if (!old) return old;
          if (old.items?.some((m) => m.id === message.id)) return old;
          return { ...old, items: [...(old.items ?? []), message] };
        });
        return;
      }
      qc.setQueriesData({ queryKey: ['messages', channelId] }, (old) => {
        if (!old) return old;
        // Dedupe by id across all pages.
        for (const page of old.pages) {
          if (page.items.some((m) => m.id === message.id)) return old;
        }
        // Prepend to the newest page (page 0).
        const pages = [...old.pages];
        pages[0] = { ...pages[0], items: [message, ...pages[0].items] };
        return { ...old, pages };
      });
    };

    const patchMessage = (channelId, messageId, fn) => {
      // Patch in both caches — a message lives in exactly one, so the no-op
      // branch in the other is harmless.
      qc.setQueriesData({ queryKey: ['messages', channelId] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            items: p.items.map((m) => (m.id === messageId ? fn(m) : m)),
          })),
        };
      });
      qc.setQueriesData({ queryKey: ['thread'] }, (old) => {
        if (!old || !old.items) return old;
        if (!old.items.some((m) => m.id === messageId)) return old;
        return { ...old, items: old.items.map((m) => (m.id === messageId ? fn(m) : m)) };
      });
    };

    const removeMessage = (channelId, messageId) =>
      patchMessage(channelId, messageId, (m) => ({ ...m, deletedAt: new Date().toISOString() }));

    // Inline "agent is typing…" indicator: resolve the run's agent handle (from
    // the agents cache) + the channel it was triggered in (from the messages
    // cache, via triggerMessageId), then dispatch a DOM event to the channel
    // view. Only fires for mention-triggered runs in a channel the client has
    // loaded — runs with no triggerMessageId (tasks, tests) stay silent.
    const emitAgentTyping = (run, running) => {
      if (!run?.agentId) return;
      // Resolve agentId → handle from any ['agents', wsId] cache.
      let agentHandle = null;
      for (const data of qc.getQueriesData({ queryKey: ['agents'] })) {
        const a = data?.items?.find((x) => x.id === run.agentId);
        if (a?.handle) {
          agentHandle = a.handle;
          break;
        }
      }
      if (!agentHandle) return;
      // Resolve triggerMessageId → channelId from any ['messages', chId] cache.
      let channelId = null;
      if (run.triggerMessageId) {
        for (const data of qc.getQueriesData({ queryKey: ['messages'] })) {
          if (!data?.pages) continue;
          for (const p of data.pages) {
            const m = p.items?.find((x) => x.id === run.triggerMessageId);
            if (m) {
              channelId = m.channelId;
              break;
            }
          }
          if (channelId) break;
        }
      }
      window.dispatchEvent(
        new CustomEvent('flotilla:agentTyping', {
          detail: { channelId, handle: agentHandle, running },
        }),
      );
    };

    const onCreated = ({ channelId, message }) => {
      upsertMessage(channelId, message);
      // Bump unread for the channel if it's not the active view.
      qc.invalidateQueries({ queryKey: ['channels'] });
    };
    const onUpdated = ({ channelId, message }) =>
      patchMessage(channelId, message.id, () => message);
    const onDeleted = ({ channelId, messageId }) => removeMessage(channelId, messageId);
    const onReaction = ({ channelId, messageId, reactions }) =>
      patchMessage(channelId, messageId, (m) => ({ ...m, reactions }));
    const onTyping = ({ channelId, name }) => {
      // Ephemeral typing indicator: dispatch to the active channel view via a
      // lightweight DOM event bus (not persisted, not in the query cache).
      window.dispatchEvent(new CustomEvent('flotilla:typing', { detail: { channelId, name } }));
    };

    socket.on(E.MESSAGE_CREATED, onCreated);
    socket.on(E.MESSAGE_UPDATED, onUpdated);
    socket.on(E.MESSAGE_DELETED, onDeleted);
    socket.on(E.REACTION_ADDED, onReaction);
    socket.on(E.REACTION_REMOVED, onReaction);
    socket.on(E.TYPING, onTyping);
    socket.on(E.TASK_CREATED, () => qc.invalidateQueries({ queryKey: ['tasks'] }));
    socket.on(E.TASK_UPDATED, () => qc.invalidateQueries({ queryKey: ['tasks'] }));
    socket.on(E.RUN_STARTED, (data) => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      emitAgentTyping(data?.run, true);
    });
    socket.on(E.RUN_EVENT, () => qc.invalidateQueries({ queryKey: ['runEvents'] }));
    socket.on(E.RUN_FINISHED, (data) => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['runEvents'] });
      emitAgentTyping(data?.run, false);
    });
    socket.on(E.AGENT_STATUS, () => qc.invalidateQueries({ queryKey: ['agents'] }));
    socket.on(E.COMPUTER_STATUS, () => qc.invalidateQueries({ queryKey: ['computers'] }));
    // Phase 5 — approval cards arrive as messages; a decision flips the card +
    // resumes the run, so refresh both caches.
    socket.on(E.APPROVAL_REQUESTED, () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['runs'] });
    });
    socket.on(E.APPROVAL_DECIDED, () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['runs'] });
    });
    // Phase 6 — a new notification lands (the bell + page refresh).
    socket.on(E.NOTIFICATION_CREATED, () => qc.invalidateQueries({ queryKey: ['notifications'] }));

    return () => {
      socket.off(E.MESSAGE_CREATED, onCreated);
      socket.off(E.MESSAGE_UPDATED, onUpdated);
      socket.off(E.MESSAGE_DELETED, onDeleted);
      socket.off(E.REACTION_ADDED, onReaction);
      socket.off(E.REACTION_REMOVED, onReaction);
      socket.off(E.TYPING, onTyping);
      socket.off(E.TASK_CREATED);
      socket.off(E.TASK_UPDATED);
      socket.off(E.RUN_STARTED);
      socket.off(E.RUN_EVENT);
      socket.off(E.RUN_FINISHED);
      socket.off(E.AGENT_STATUS);
      socket.off(E.COMPUTER_STATUS);
      socket.off(E.APPROVAL_REQUESTED);
      socket.off(E.APPROVAL_DECIDED);
      socket.off(E.NOTIFICATION_CREATED);
      disconnectSocket();
    };
  }, [qc]);

  return children;
}
