/**
 * Channel routes — /api/v1/workspaces/:id/channels, /api/v1/channels/:channelId,
 * and /api/v1/workspaces/:id/dms (PLAN.md §7.1).
 */
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validateBody } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspaceMember } from '../../middleware/workspace.js';
import { requireChannelAccess } from '../../middleware/channel.js';
import { createChannelSchema, updateChannelSchema, paginationSchema } from '@flotila-org/shared';
import { z } from 'zod';
import * as svc from './service.js';

export const router = Router();

function toChannel(c) {
  return {
    id: c.id,
    workspaceId: c.workspaceId,
    name: c.name,
    topic: c.topic,
    kind: c.kind,
    createdBy: c.createdById ?? c.createdBy,
    lastReadMessageId: c.lastReadMessageId ?? null,
    unreadCount: c.unreadCount ?? 0,
    createdAt: c.createdAt,
  };
}

// POST /workspaces/:id/channels
router.post(
  '/workspaces/:id/channels',
  requireAuth,
  requireWorkspaceMember,
  validateBody(createChannelSchema),
  asyncHandler(async (req, res) => {
    const ch = await svc.createChannel({
      workspaceId: req.workspace.id,
      name: req.body.name,
      kind: req.body.kind,
      topic: req.body.topic,
      memberActorIds: req.body.memberActorIds,
      createdById: req.actorId,
    });
    res.status(201).json(toChannel(ch));
  }),
);

// GET /workspaces/:id/channels
router.get(
  '/workspaces/:id/channels',
  requireAuth,
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    const list = await svc.listChannelsForActor(req.workspace.id, req.actorId);
    res.json({ items: list.map(toChannel) });
  }),
);

// GET /workspaces/:id/dms  { actorIds[] }  -> find-or-create
router.post(
  '/workspaces/:id/dms',
  requireAuth,
  requireWorkspaceMember,
  validateBody(z.object({ actorIds: z.array(z.string().uuid()).min(2) })),
  asyncHandler(async (req, res) => {
    const dm = await svc.findOrCreateDm({
      workspaceId: req.workspace.id,
      actorIds: req.body.actorIds,
      createdById: req.actorId,
    });
    res.status(201).json(toChannel(dm));
  }),
);

// GET /channels/:channelId
router.get('/channels/:channelId', requireAuth, requireChannelAccess, (req, res) => {
  res.json(toChannel(req.channel));
});

// PATCH /channels/:channelId
router.patch(
  '/channels/:channelId',
  requireAuth,
  requireChannelAccess,
  validateBody(updateChannelSchema),
  asyncHandler(async (req, res) => {
    const updated = await svc.updateChannel(req.channel, req.body);
    res.json(toChannel(updated));
  }),
);

// POST /channels/:channelId/members  { actorIds[] }
router.post(
  '/channels/:channelId/members',
  requireAuth,
  requireChannelAccess,
  validateBody(z.object({ actorIds: z.array(z.string().uuid()).min(1) })),
  asyncHandler(async (req, res) => {
    await svc.addMembers(req.channel.id, req.body.actorIds);
    res.status(201).json({ ok: true });
  }),
);

// DELETE /channels/:channelId/members/:actorId
router.delete(
  '/channels/:channelId/members/:actorId',
  requireAuth,
  requireChannelAccess,
  asyncHandler(async (req, res) => {
    await svc.removeMember(req.channel.id, req.params.actorId);
    res.json({ ok: true });
  }),
);

// POST /channels/:channelId/read  { messageId }  -> read cursor
router.post(
  '/channels/:channelId/read',
  requireAuth,
  requireChannelAccess,
  validateBody(z.object({ messageId: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    await svc.markRead(req.channel.id, req.actorId, req.body.messageId);
    res.json({ ok: true });
  }),
);

export { paginationSchema };
