/**
 * Notification center (PLAN.md §15). Notifications are per-user rows; creating
 * one also emits `notification.created` over the user's socket + attempts a web
 * push (improvement #8). Mention/approval/run-finished events call notify().
 */
import { prisma } from '../../lib/db.js';

// Lazy realtime import (avoids a module-eval cycle with realtime → runs → here).
async function rt() {
  return (await import('../../realtime/index.js')).getRealtime();
}
// Lazy push import (push module imports web-push; keep it optional).
async function loadPush() {
  return await import('../push/service.js');
}

function serialize(n) {
  return {
    id: n.id,
    type: n.type,
    payload: n.payload,
    readAt: n.readAt,
    createdAt: n.createdAt,
  };
}

/** Create a notification for one user + emit + push. Best-effort side effects. */
export async function createNotification({ userId, workspaceId, type, payload = {} }) {
  const n = await prisma.notification.create({
    data: { userId, workspaceId, type, payload },
  });
  const body = serialize(n);
  (await rt())?.broadcastNotification(userId, body);
  return n;
}

/** Fan a notification out to many users (e.g. all workspace members on approval). */
export async function notifyUsers(userIds, { workspaceId, type, payload }) {
  const out = [];
  for (const userId of [...new Set(userIds)]) {
    try {
      out.push(await createNotification({ userId, workspaceId, type, payload }));
    } catch {
      // one bad user shouldn't break the batch
    }
  }
  return out;
}

export async function listNotifications(userId, { limit = 50, unreadOnly = false } = {}) {
  const where = { userId, ...(unreadOnly ? { readAt: null } : {}) };
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items: items.map(serialize), unread };
}

export async function markRead(userId, ids) {
  if (!ids?.length) {
    return prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
  return prisma.notification.updateMany({
    where: { id: { in: ids }, userId },
    data: { readAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Lifecycle triggers — notify + push on the events users care about. Each is
// best-effort (one failing sub-delivery never breaks the parent operation).
// ---------------------------------------------------------------------------

/** Human members of the workspace who can act on an approval (PLAN.md "done when"). */
async function humanMemberUserIds(workspaceId) {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, actor: { kind: 'user' } },
    include: { actor: { include: { user: true } } },
  });
  return [...new Set(members.map((m) => m.actor.userId).filter(Boolean))];
}

/** Approval requested → notify + push every human member. */
export async function notifyApprovalRequested({
  workspaceId,
  approvalId,
  runId,
  agentHandle,
  action,
  label,
}) {
  const userIds = await humanMemberUserIds(workspaceId);
  const push = await loadPush();
  await Promise.all(
    userIds.map(async (userId) => {
      await createNotification({
        userId,
        workspaceId,
        type: 'approval',
        payload: {
          approvalId,
          runId,
          agentHandle,
          action,
          label,
          title: `@${agentHandle} needs approval`,
        },
      }).catch(() => {});
      // The "phone gets a push when an agent needs approval" moment.
      await push
        .sendPush(userId, {
          title: `@${agentHandle} needs approval`,
          body: `${action}${label ? ` — ${label}` : ''}`,
          url: '/',
          tag: `approval:${approvalId}`,
        })
        .catch(() => {});
    }),
  );
}

/** A user was @mentioned → notify + push them. */
export async function notifyMention({
  userId,
  workspaceId,
  byName,
  channelId,
  messageId,
  preview,
}) {
  await createNotification({
    userId,
    workspaceId,
    type: 'mention',
    payload: {
      byName,
      channelId,
      messageId,
      title: `${byName} mentioned you`,
      preview: String(preview || '').slice(0, 120),
    },
  }).catch(() => {});
  const push = await loadPush();
  await push
    .sendPush(userId, {
      title: `${byName} mentioned you`,
      body: String(preview || '').slice(0, 120),
      url: '/',
    })
    .catch(() => {});
}

/** A run finished → notify + push the user who triggered it (if human). */
export async function notifyRunFinished({ workspaceId, runId, userId, agentHandle, status }) {
  if (!userId) return;
  await createNotification({
    userId,
    workspaceId,
    type: 'run_finished',
    payload: { runId, agentHandle, status, title: `@${agentHandle} ${status}` },
  }).catch(() => {});
  const push = await loadPush();
  await push
    .sendPush(userId, {
      title: `@${agentHandle} ${status}`,
      body: `Run ${runId.slice(0, 8)} ${status}`,
      url: '/',
    })
    .catch(() => {});
}
