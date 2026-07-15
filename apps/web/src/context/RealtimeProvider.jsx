import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { CLIENT_SOCKET_EVENTS as E } from '@flotila-org/shared';

/**
 * Connects the /client socket while authenticated and patches the TanStack
 * Query cache from realtime events (PLAN.md §9.3). Typed inserts keep messages
 * newest-first within each page.
 */
export function RealtimeProvider({ children }) {
  const qc = useQueryClient();

  useEffect(() => {
    const socket = connectSocket();

    const upsertMessage = (channelId, message) => {
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
    };

    const removeMessage = (channelId, messageId) =>
      patchMessage(channelId, messageId, (m) => ({ ...m, deletedAt: new Date().toISOString() }));

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
    socket.on(E.RUN_STARTED, () => qc.invalidateQueries({ queryKey: ['messages'] }));
    socket.on(E.RUN_EVENT, () => qc.invalidateQueries({ queryKey: ['runEvents'] }));
    socket.on(E.RUN_FINISHED, () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['runEvents'] });
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
