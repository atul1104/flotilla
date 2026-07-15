/**
 * Notification routes — /api/v1/notifications (PLAN.md §7.1). Per-user (scoped
 * by session user, no workspace param).
 */
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { markNotificationsReadSchema } from '@flotila-org/shared';
import * as svc from './service.js';

export const router = Router();

// GET /notifications
router.get(
  '/notifications',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await svc.listNotifications(req.userId));
  }),
);

// POST /notifications/read  { ids: [] }  (omit/empty ids => mark all read)
router.post(
  '/notifications/read',
  requireAuth,
  validateBody(markNotificationsReadSchema),
  asyncHandler(async (req, res) => {
    await svc.markRead(req.userId, req.body.ids);
    res.json({ ok: true });
  }),
);
