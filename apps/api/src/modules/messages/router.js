/**
 * Message routes — /api/v1/channels/:channelId/messages and /api/v1/messages/:id
 * (PLAN.md §7.1). Thin: validate -> service. Realtime broadcast is added in
 * Phase 2's socket layer (realtime/), triggered from the service callbacks.
 */
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireChannelAccess, requireMessageAccess } from '../../middleware/channel.js';
import {
  createMessageSchema,
  updateMessageSchema,
  addReactionSchema,
  paginationSchema,
} from '@atul1104/shared';
import { z } from 'zod';
import * as svc from './service.js';
import { getRealtime } from '../../realtime/index.js';
import { messageLimiter } from '../../middleware/rateLimit.js';
import * as runs from '../runs/service.js';
import { prisma } from '../../lib/db.js';

export const router = Router();

// GET /channels/:channelId/messages?cursor=&limit=  (newest-first pages)
router.get(
  '/channels/:channelId/messages',
  requireAuth,
  requireChannelAccess,
  validateQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    const page = await svc.listMessages(req.channel.id, {
      cursor: req.query.cursor,
      limit: req.query.limit,
      plan: req.channel.workspace.plan,
    });
    // Enrich with reply counts for thread roots.
    const counts = await svc.replyCounts(page.items.map((m) => m.id));
    res.json({
      items: page.items.map((m) => ({ ...m, replyCount: counts[m.id] ?? 0 })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    });
  }),
);

// POST /channels/:channelId/messages
router.post(
  '/channels/:channelId/messages',
  requireAuth,
  requireChannelAccess,
  messageLimiter,
  validateBody(createMessageSchema),
  asyncHandler(async (req, res) => {
    const { message, mentionedActorIds } = await svc.createMessage({
      channelId: req.channel.id,
      senderId: req.actorId,
      content: req.body.content,
      threadRootId: req.body.threadRootId,
      attachmentIds: req.body.attachmentIds,
      clientNonce: req.body.clientNonce,
    });
    // Persisted first, then broadcast (PLAN.md §4 rule).
    getRealtime()?.broadcastMessage(
      req.channel.workspaceId,
      req.channel.id,
      message,
      mentionedActorIds,
    );
    // @mention of an agent triggers a run (PLAN.md §8.4). Fire-and-forget.
    runs
      .triggerForMentions(req.channel.workspaceId, message.id, mentionedActorIds, req.body.content)
      .catch(() => {});
    // Phase 6 — notify + push any mentioned humans (agents ran above).
    if (mentionedActorIds?.length) {
      prisma.actor
        .findMany({
          where: { id: { in: mentionedActorIds }, kind: 'user' },
          include: { user: true },
        })
        .then((humans) =>
          Promise.all(
            humans.map((a) =>
              import('../notifications/service.js').then(({ notifyMention }) =>
                notifyMention({
                  userId: a.userId,
                  workspaceId: req.channel.workspaceId,
                  byName: a.user?.name ?? 'Someone',
                  channelId: req.channel.id,
                  messageId: message.id,
                  preview: req.body.content,
                }),
              ),
            ),
          ),
        )
        .catch(() => {});
    }
    res.status(201).json(message);
  }),
);

// PATCH /messages/:messageId
router.patch(
  '/messages/:messageId',
  requireAuth,
  requireMessageAccess,
  validateBody(updateMessageSchema),
  asyncHandler(async (req, res) => {
    const message = await svc.updateMessage(req.params.messageId, req.actorId, req.body.content);
    getRealtime()?.broadcastMessageUpdate(req.channel.workspaceId, req.channel.id, message);
    res.json(message);
  }),
);

// DELETE /messages/:messageId
router.delete(
  '/messages/:messageId',
  requireAuth,
  requireMessageAccess,
  asyncHandler(async (req, res) => {
    await svc.deleteMessage(req.params.messageId, req.actorId);
    getRealtime()?.broadcastMessageDelete(
      req.channel.workspaceId,
      req.channel.id,
      req.params.messageId,
    );
    res.json({ ok: true });
  }),
);

// GET /messages/:messageId/thread
router.get(
  '/messages/:messageId/thread',
  requireAuth,
  requireMessageAccess,
  asyncHandler(async (req, res) => {
    const replies = await svc.listThread(req.params.messageId);
    res.json({ items: replies });
  }),
);

// POST /messages/:messageId/reactions  { emoji }
router.post(
  '/messages/:messageId/reactions',
  requireAuth,
  requireMessageAccess,
  validateBody(addReactionSchema),
  asyncHandler(async (req, res) => {
    const reactions = await svc.addReaction(req.params.messageId, req.actorId, req.body.emoji);
    getRealtime()?.broadcastReaction(req.channel.workspaceId, req.channel.id, {
      messageId: req.params.messageId,
      emoji: req.body.emoji,
      added: true,
      actorId: req.actorId,
      reactions,
    });
    res.json(reactions);
  }),
);

// DELETE /messages/:messageId/reactions?emoji=
router.delete(
  '/messages/:messageId/reactions',
  requireAuth,
  requireMessageAccess,
  validateQuery(z.object({ emoji: z.string().min(1).max(32) })),
  asyncHandler(async (req, res) => {
    const reactions = await svc.removeReaction(req.params.messageId, req.actorId, req.query.emoji);
    getRealtime()?.broadcastReaction(req.channel.workspaceId, req.channel.id, {
      messageId: req.params.messageId,
      emoji: req.query.emoji,
      added: false,
      actorId: req.actorId,
      reactions,
    });
    res.json(reactions);
  }),
);
