/**
 * Channel business logic (PLAN.md §6, §7.1). public / private / DM kinds.
 * Membership: public channels are visible to all workspace members; private +
 * DM require explicit channel membership. DMs are find-or-create between a set
 * of actors.
 */
import { prisma } from '../../lib/db.js';
import { ConflictError } from '@flotilla/shared';
import { CHANNEL_KIND } from '@flotilla/shared';

/** Can this actor see this channel? (public = any workspace member; else member) */
export async function canSeeChannel(channelId, actorId) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { workspace: { include: { members: { where: { actorId } } } } },
  });
  if (!channel) return { ok: false };
  if (channel.kind === CHANNEL_KIND.PUBLIC) {
    return { ok: channel.workspace.members.length > 0, channel };
  }
  const cm = await prisma.channelMember.findUnique({
    where: { channelId_actorId: { channelId, actorId } },
  });
  return { ok: !!cm, channel };
}

export async function createChannel({
  workspaceId,
  name,
  kind,
  topic,
  memberActorIds,
  createdById,
}) {
  const exists = await prisma.channel.findUnique({
    where: { workspaceId_name: { workspaceId, name } },
  });
  if (exists) throw new ConflictError('A channel with that name already exists');

  return prisma.$transaction(async (tx) => {
    const channel = await tx.channel.create({
      data: {
        workspaceId,
        name,
        kind,
        topic,
        createdById,
      },
    });
    const members = new Set(memberActorIds ?? []);
    members.add(createdById); // creator is always a member
    if (kind !== CHANNEL_KIND.PUBLIC) {
      await tx.channelMember.createMany({
        data: [...members].map((actorId) => ({ channelId: channel.id, actorId })),
        skipDuplicates: true,
      });
    }
    return tx.channel.findUnique({ where: { id: channel.id } });
  });
}

/** List channels visible to an actor, with per-channel membership metadata. */
export async function listChannelsForActor(workspaceId, actorId) {
  // All public channels in the workspace.
  const publicCh = await prisma.channel.findMany({
    where: { workspaceId, kind: CHANNEL_KIND.PUBLIC, archivedAt: null },
    orderBy: { name: 'asc' },
  });
  // Private + DM channels the actor belongs to.
  const memberOf = await prisma.channelMember.findMany({
    where: { actorId, channel: { workspaceId, archivedAt: null } },
    include: { channel: true },
  });
  const privateCh = memberOf
    .filter((m) => m.channel.kind !== CHANNEL_KIND.PUBLIC)
    .map((m) => ({ ...m.channel, lastReadMessageId: m.lastReadMessageId }));

  const channels = [...publicCh, ...privateCh].sort((a, b) => {
    // DMs last, then alphabetical.
    const order = { public: 0, private: 1, dm: 2 };
    if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
    return a.name.localeCompare(b.name);
  });

  // Attach unread counts (messages newer than lastReadMessageId created by others).
  const enriched = await Promise.all(
    channels.map(async (c) => {
      const lastRead = await prisma.channelMember.findUnique({
        where: { channelId_actorId: { channelId: c.id, actorId } },
      });
      const gt = lastRead?.lastReadMessageId ? { gt: lastRead.lastReadMessageId } : undefined;
      const unread = await prisma.message.count({
        where: { channelId: c.id, deletedAt: null, senderId: { not: actorId }, id: gt },
      });
      return { ...c, lastReadMessageId: lastRead?.lastReadMessageId ?? null, unreadCount: unread };
    }),
  );
  return enriched;
}

/** Find-or-create a DM channel between exactly this set of actors. */
export async function findOrCreateDm({ workspaceId, actorIds, createdById }) {
  const ids = [...new Set(actorIds)].sort();
  if (ids.length < 2) throw new ConflictError('DM needs at least 2 actors');

  // A DM channel is "the same" if its member set equals `ids`.
  const candidates = await prisma.channel.findMany({
    where: { workspaceId, kind: CHANNEL_KIND.DM },
    include: { members: true },
  });
  const match = candidates.find((c) => {
    const set = c.members.map((m) => m.actorId).sort();
    return set.length === ids.length && set.every((v, i) => v === ids[i]);
  });
  if (match) return match;

  // Create with a deterministic-ish name (joined ids prefix) — name uniqueness per ws.
  const name = `dm-${ids.map((id) => id.slice(0, 6)).join('-')}`;
  return createChannel({
    workspaceId,
    name,
    kind: CHANNEL_KIND.DM,
    createdById,
    memberActorIds: ids,
  });
}

export async function updateChannel(channel, patch) {
  return prisma.channel.update({ where: { id: channel.id }, data: patch });
}

export async function addMembers(channelId, actorIds) {
  await prisma.channelMember.createMany({
    data: actorIds.map((actorId) => ({ channelId, actorId })),
    skipDuplicates: true,
  });
}

export async function removeMember(channelId, actorId) {
  await prisma.channelMember.delete({
    where: { channelId_actorId: { channelId, actorId } },
  });
}

/** Record read cursor (id of the newest message the actor has seen). */
export async function markRead(channelId, actorId, messageId) {
  await prisma.channelMember.upsert({
    where: { channelId_actorId: { channelId, actorId } },
    update: { lastReadMessageId: messageId },
    create: { channelId, actorId, lastReadMessageId: messageId },
  });
}
