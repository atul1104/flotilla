/**
 * Channel access middleware. Loads the channel from :channelId, verifies the
 * actor is a member of its workspace, and (for private/DM) a channel member.
 * Attaches `req.channel`. This is the tenant boundary for chat routes.
 */
import { ForbiddenError, NotFoundError } from '@atul1104/shared';
import { CHANNEL_KIND } from '@atul1104/shared';
import { prisma } from '../lib/db.js';
import { asyncHandler } from '../lib/asyncHandler.js';

/** Core access check: returns the channel or throws. Used by both middlewares. */
async function assertChannelAccess(channelId, actorId) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { workspace: true },
  });
  if (!channel) throw new NotFoundError('Channel not found');

  const wsMember = await prisma.workspaceMember.findUnique({
    where: { workspaceId_actorId: { workspaceId: channel.workspaceId, actorId } },
  });
  if (!wsMember) throw new ForbiddenError('Not a member of this workspace');

  if (channel.kind !== CHANNEL_KIND.PUBLIC) {
    const cm = await prisma.channelMember.findUnique({
      where: { channelId_actorId: { channelId, actorId } },
    });
    if (!cm) throw new ForbiddenError('Not a member of this channel');
  }
  return channel;
}

export const requireChannelAccess = asyncHandler(async (req, _res, next) => {
  const channelId = req.params.channelId || req.params.id;
  if (!channelId) return next(new NotFoundError('Channel not specified'));
  try {
    req.channel = await assertChannelAccess(channelId, req.actorId);
    next();
  } catch (err) {
    next(err);
  }
});

/** For /messages/:messageId routes — resolves the message's channel, then checks access. */
export const requireMessageAccess = asyncHandler(async (req, _res, next) => {
  const messageId = req.params.messageId || req.params.id;
  if (!messageId) return next(new NotFoundError('Message not specified'));
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) return next(new NotFoundError('Message not found'));
  try {
    req.channel = await assertChannelAccess(message.channelId, req.actorId);
    req.message = message;
    next();
  } catch (err) {
    next(err);
  }
});
