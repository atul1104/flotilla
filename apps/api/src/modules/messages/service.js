/**
 * Message business logic (PLAN.md §6, §7.1). Cursor pagination by (createdAt,id),
 * threads, reactions (aggregated), and server-side mention parsing.
 */
import { prisma } from '../../lib/db.js';
import { NotFoundError, ForbiddenError } from '@atul1104/shared';
import { historyCutoff } from '../../lib/limits.js';

const MENTION_RE = /(^|\s)@([a-z0-9_.-]+)/gi;

function encodeCursor(createdAt, id) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}
function decodeCursor(cursor) {
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function serializeSender(actor) {
  if (!actor) return { id: null, kind: null, name: null, avatarUrl: null };
  const u = actor.user;
  const a = actor.agent; // present for agent actors (kind=agent)
  return {
    id: actor.id,
    kind: actor.kind,
    // Humans have a name via user; agents have a name + @handle on the Agent row.
    name: u?.name ?? a?.name ?? a?.handle ?? 'agent',
    handle: a?.handle ?? null,
    avatarUrl: u?.avatarUrl ?? a?.avatarUrl ?? null,
  };
}

function aggregateReactions(reactions) {
  const map = new Map();
  for (const r of reactions ?? []) {
    const key = r.emoji;
    if (!map.has(key)) map.set(key, { emoji: key, count: 0, reactors: [] });
    const entry = map.get(key);
    entry.count += 1;
    entry.reactors.push(r.actorId);
  }
  return [...map.values()];
}

/** Newest-first page of (non-deleted) messages in a channel. */
export async function listMessages(channelId, { cursor, limit, plan } = {}) {
  const take = limit + 1;
  const c = cursor ? decodeCursor(cursor) : null;
  // Free plans gate reads at N days (data retained, read gated). PLAN.md §6.
  const cutoff = plan ? historyCutoff(plan) : null;
  const rows = await prisma.message.findMany({
    where: {
      channelId,
      deletedAt: null,
      threadRootId: null, // top-level only here; threads via listThread
      ...(cutoff ? { createdAt: { gte: cutoff } } : {}),
      ...(c
        ? {
            OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    include: {
      sender: { include: { user: true, agent: true } },
      reactions: true,
    },
  });
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map(serializeMessage);
  const nextCursor =
    hasMore && items.length ? encodeCursor(rows[limit - 1].createdAt, rows[limit - 1].id) : null;
  return { items, nextCursor, hasMore };
}

export function serializeMessage(m) {
  return {
    id: m.id,
    channelId: m.channelId,
    senderId: m.senderId,
    sender: serializeSender(m.sender),
    threadRootId: m.threadRootId,
    content: m.content,
    payload: m.payload,
    runId: m.runId,
    editedAt: m.editedAt,
    createdAt: m.createdAt,
    reactions: aggregateReactions(m.reactions),
    replyCount: m.replyCount ?? 0,
  };
}

/** Thread replies for a root message, oldest-first. */
export async function listThread(rootId) {
  const rows = await prisma.message.findMany({
    where: { threadRootId: rootId, deletedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { sender: { include: { user: true, agent: true } }, reactions: true },
  });
  return rows.map(serializeMessage);
}

/** Count replies for a batch of root ids (used to enrich a page). */
export async function replyCounts(rootIds) {
  if (!rootIds.length) return {};
  const grouped = await prisma.message.groupBy({
    by: ['threadRootId'],
    where: { threadRootId: { in: rootIds }, deletedAt: null },
    _count: { _all: true },
  });
  return Object.fromEntries(grouped.map((g) => [g.threadRootId, g._count._all]));
}

// ---------------------------------------------------------------------------
// Create / edit / delete
// ---------------------------------------------------------------------------
export async function createMessage({
  channelId,
  senderId,
  content,
  threadRootId,
  attachmentIds,
  clientNonce,
  payload,
}) {
  if (threadRootId) {
    const root = await prisma.message.findUnique({ where: { id: threadRootId } });
    if (!root || root.channelId !== channelId) throw new NotFoundError('Thread root not found');
  }

  // Dedupe optimistic sends by client nonce within this channel/sender window.
  if (clientNonce) {
    const recent = await prisma.message.findFirst({
      where: {
        channelId,
        senderId,
        payload: { path: ['clientNonce'], equals: clientNonce },
        createdAt: { gt: new Date(Date.now() - 60_000) },
      },
    });
    if (recent)
      return {
        message: serializeMessage({ ...recent, sender: null, reactions: [] }),
        duplicate: true,
      };
  }

  // Structured payload wins (agent cards: task refs, approvals, artifacts);
  // otherwise the client nonce is stored so optimistic dedupe can find it.
  const dataPayload = payload ?? (clientNonce ? { clientNonce } : null);
  const message = await prisma.message.create({
    data: {
      channelId,
      senderId,
      threadRootId,
      content,
      payload: dataPayload,
      attachments: attachmentIds?.length
        ? { connect: attachmentIds.map((id) => ({ id })) }
        : undefined,
    },
    include: { sender: { include: { user: true, agent: true } }, reactions: true, attachments: true },
  });

  const mentionedActorIds = await resolveMentions(message.channelId, content);
  if (mentionedActorIds.length) {
    await prisma.mention.createMany({
      data: mentionedActorIds.map((mentionedActorId) => ({
        messageId: message.id,
        mentionedActorId,
      })),
      skipDuplicates: true,
    });
  }

  return { message: serializeMessage(message), mentionedActorIds };
}

export async function updateMessage(messageId, actorId, content) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg) throw new NotFoundError('Message not found');
  if (msg.senderId !== actorId) throw new ForbiddenError('You can only edit your own messages');
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { content, editedAt: new Date() },
    include: { sender: { include: { user: true, agent: true } }, reactions: true },
  });
  return serializeMessage(updated);
}

export async function deleteMessage(messageId, actorId) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg) throw new NotFoundError('Message not found');
  if (msg.senderId !== actorId) throw new ForbiddenError('You can only delete your own messages');
  await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------
export async function addReaction(messageId, actorId, emoji) {
  await prisma.reaction.upsert({
    where: { messageId_actorId_emoji: { messageId, actorId, emoji } },
    update: {},
    create: { messageId, actorId, emoji },
  });
  const reactions = await prisma.reaction.findMany({ where: { messageId } });
  return aggregateReactions(reactions);
}

export async function removeReaction(messageId, actorId, emoji) {
  await prisma.reaction
    .delete({ where: { messageId_actorId_emoji: { messageId, actorId, emoji } } })
    .catch(() => {});
  const reactions = await prisma.reaction.findMany({ where: { messageId } });
  return aggregateReactions(reactions);
}

// ---------------------------------------------------------------------------
// Mention resolution: @token -> member actor ids. Only actors who can SEE the
// channel are resolvable — for private/DM channels that's channel members only,
// so an agent (or human) that isn't in a private channel is never resolved and
// (for agents) never triggered/handed-off into a thread it can't read.
// (PLAN.md §11 tenant isolation; Phase 5 authz hardening.)
// ---------------------------------------------------------------------------
async function resolveMentions(channelId, content) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      members: { include: { actor: { include: { user: true, agent: true } } } },
    },
  });
  if (!channel) return [];
  let members = channel.members;
  if (channel.kind === 'public') {
    // Public channels are visible to the whole workspace.
    const ws = await prisma.workspace.findUnique({
      where: { id: channel.workspaceId },
      include: { members: { include: { actor: { include: { user: true, agent: true } } } } },
    });
    members = ws?.members ?? [];
  }
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const byToken = new Map();
  for (const m of members) {
    const actor = m.actor;
    if (!actor) continue;
    const tokens = [
      actor.user && norm(actor.user.name),
      actor.user && norm(actor.user.email.split('@')[0]),
      actor.agent && norm(actor.agent.handle), // @handle for agents
    ].filter(Boolean);
    for (const t of tokens) if (t && !byToken.has(t)) byToken.set(t, actor.id);
  }
  const hits = new Set();
  for (const match of content.matchAll(MENTION_RE)) {
    const token = norm(match[2]);
    const actorId = byToken.get(token);
    if (actorId) hits.add(actorId);
  }
  return [...hits];
}
