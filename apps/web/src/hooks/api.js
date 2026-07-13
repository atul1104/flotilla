import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

/** Workspace channels for the sidebar (+ unread counts). */
export function useChannels(workspaceId) {
  return useQuery({
    queryKey: ['channels', workspaceId],
    queryFn: () => api.get(`/workspaces/${workspaceId}/channels`),
    enabled: !!workspaceId,
  });
}

export function useMembers(workspaceId) {
  return useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () => api.get(`/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId,
  });
}

/** Newest-first pages; flatten + reverse for chronological display. */
export function useMessages(channelId) {
  return useInfiniteQuery({
    queryKey: ['messages', channelId],
    queryFn: ({ pageParam }) =>
      api.get(
        `/channels/${channelId}/messages`,
        pageParam ? { cursor: pageParam, limit: 50 } : { limit: 50 },
      ),
    initialPageParam: undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    enabled: !!channelId,
  });
}

export function useSendMessage(channelId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post(`/channels/${channelId}/messages`, body),
    onSuccess: (message) => {
      // Server echoes the persisted message; reconcile into cache (deduped by id).
      qc.setQueriesData({ queryKey: ['messages', channelId] }, (old) => {
        if (!old) return old;
        for (const page of old.pages) if (page.items.some((m) => m.id === message.id)) return old;
        const pages = [...old.pages];
        pages[0] = { ...pages[0], items: [message, ...pages[0].items] };
        return { ...old, pages };
      });
      qc.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}

export function useThread(messageId, enabled) {
  return useQuery({
    queryKey: ['thread', messageId],
    queryFn: () => api.get(`/messages/${messageId}/thread`),
    enabled: !!messageId && enabled,
  });
}

export function useReact(channelId) {
  const qc = useQueryClient();
  const patch = (messageId, reactions) =>
    qc.setQueriesData({ queryKey: ['messages', channelId] }, (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((p) => ({
          ...p,
          items: p.items.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
        })),
      };
    });
  return {
    add: useMutation({
      mutationFn: ({ messageId, emoji }) => api.post(`/messages/${messageId}/reactions`, { emoji }),
      onSuccess: (reactions, { messageId }) => patch(messageId, reactions),
    }),
    remove: useMutation({
      mutationFn: ({ messageId, emoji }) =>
        api.del(`/messages/${messageId}/reactions`, { query: { emoji } }),
      onSuccess: (reactions, { messageId }) => patch(messageId, reactions),
    }),
  };
}

// ---------------------------------------------------------------------------
// Tasks (Phase 3)
// ---------------------------------------------------------------------------
export function useTasks(workspaceId, query = {}) {
  return useQuery({
    queryKey: ['tasks', workspaceId, query],
    queryFn: () => api.get(`/workspaces/${workspaceId}/tasks`, query),
    enabled: !!workspaceId,
  });
}

export function useTaskEvents(taskId, enabled) {
  return useQuery({
    queryKey: ['taskEvents', taskId],
    queryFn: () => api.get(`/tasks/${taskId}/events`),
    enabled: !!taskId && enabled,
  });
}

export function useTaskMutations(workspaceId) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
  return {
    create: useMutation({
      mutationFn: (body) => api.post(`/workspaces/${workspaceId}/tasks`, body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ taskId, ...body }) => api.patch(`/tasks/${taskId}`, body),
      onSuccess: invalidate,
    }),
    claim: useMutation({
      mutationFn: (taskId) => api.post(`/tasks/${taskId}/claim`),
      onSuccess: invalidate,
    }),
    complete: useMutation({
      mutationFn: (taskId) => api.post(`/tasks/${taskId}/complete`),
      onSuccess: invalidate,
    }),
    handoff: useMutation({
      mutationFn: ({ taskId, toActorId }) => api.post(`/tasks/${taskId}/handoff`, { toActorId }),
      onSuccess: invalidate,
    }),
  };
}

// ---------------------------------------------------------------------------
// Agents + computers + runs (Phase 4)
// ---------------------------------------------------------------------------
export function useAgents(workspaceId) {
  return useQuery({
    queryKey: ['agents', workspaceId],
    queryFn: () => api.get(`/workspaces/${workspaceId}/agents`),
    enabled: !!workspaceId,
  });
}

export function useComputers(workspaceId) {
  return useQuery({
    queryKey: ['computers', workspaceId],
    queryFn: () => api.get(`/workspaces/${workspaceId}/computers`),
    enabled: !!workspaceId,
  });
}

export function useAgentMutations(workspaceId) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['agents', workspaceId] });
  return {
    create: useMutation({
      mutationFn: (body) => api.post(`/workspaces/${workspaceId}/agents`, body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ agentId, ...body }) => api.patch(`/agents/${agentId}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (agentId) => api.del(`/agents/${agentId}`),
      onSuccess: invalidate,
    }),
    test: useMutation({ mutationFn: (agentId) => api.post(`/agents/${agentId}/test`) }),
  };
}

export function useRunEvents(runId, enabled) {
  return useQuery({
    queryKey: ['runEvents', runId],
    queryFn: () => api.get(`/runs/${runId}/events`),
    enabled: !!runId && enabled,
    refetchInterval: (q) => {
      // Poll while the run is likely active (cheap; sockets patch the cache too).
      return q.state.data ? false : 1500;
    },
  });
}

// ---------------------------------------------------------------------------
// Phase 5 — approvals, run history, retry, agent policy
// ---------------------------------------------------------------------------
export function useAgentRuns(workspaceId, agentId) {
  return useQuery({
    queryKey: ['runs', workspaceId, agentId],
    queryFn: () => api.get(`/agents/${agentId}/runs`),
    enabled: !!workspaceId && !!agentId,
  });
}

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ approvalId, decision }) =>
      api.post(`/approvals/${approvalId}/decide`, { decision }),
    // The card flips via the realtime approval.decided broadcast; invalidate as
    // a backstop so runs + messages stay fresh.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['runs'] });
    },
  });
}

export function useRetryRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId) => api.post(`/runs/${runId}/retry`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['runs'] }),
  });
}

/** Workspace-wide run feed (Activity page, PLAN.md §9.1). */
export function useWorkspaceRuns(workspaceId) {
  return useQuery({
    queryKey: ['runs', 'workspace', workspaceId],
    queryFn: () => api.get(`/workspaces/${workspaceId}/runs`),
    enabled: !!workspaceId,
  });
}

// ---------------------------------------------------------------------------
// Phase 6 — notifications, search, usage, agent teams
// ---------------------------------------------------------------------------
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications'),
    refetchInterval: 30_000, // light poll; socket also invalidates on new ones
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids) => api.post('/notifications/read', ids?.length ? { ids } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useSearch(workspaceId, q, enabled) {
  return useQuery({
    queryKey: ['search', workspaceId, q],
    queryFn: () => api.get(`/workspaces/${workspaceId}/search`, { q }),
    enabled: !!workspaceId && !!q && enabled,
  });
}

export function useUsage(workspaceId, days = 30) {
  return useQuery({
    queryKey: ['usage', workspaceId, days],
    queryFn: () => api.get(`/workspaces/${workspaceId}/usage`, { days }),
    enabled: !!workspaceId,
  });
}

export function useTeamTemplates(workspaceId) {
  return useQuery({
    queryKey: ['agentTemplates', workspaceId],
    queryFn: () => api.get(`/workspaces/${workspaceId}/agent-templates`),
    enabled: !!workspaceId,
  });
}

export function useCreateTeam(workspaceId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ template, computerId }) =>
      api.post(`/workspaces/${workspaceId}/agent-teams`, { template, computerId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents', workspaceId] }),
  });
}
