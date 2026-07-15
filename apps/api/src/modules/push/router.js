/**
 * Web push routes — /api/v1/push (PLAN.md §7.1). Subscribe/unsubscribe a
 * browser's push subscription + expose the VAPID public key.
 */
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { z } from 'zod';
import { pushSubscribeSchema } from '@flotila-org/shared';
import * as svc from './service.js';

export const router = Router();

// GET /push/vapid-public — the browser needs this to subscribe via PushManager
router.get(
  '/push/vapid-public',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ publicKey: svc.getVapidPublicKey(), enabled: svc.isPushEnabled() });
  }),
);

// POST /push/subscribe { endpoint, keys, expirationTime? }
router.post(
  '/push/subscribe',
  requireAuth,
  validateBody(pushSubscribeSchema),
  asyncHandler(async (req, res) => {
    await svc.subscribe(req.userId, req.body);
    res.status(201).json({ ok: true });
  }),
);

// DELETE /push/subscribe { endpoint }
router.delete(
  '/push/subscribe',
  requireAuth,
  validateBody(z.object({ endpoint: z.string().url().max(2000) })),
  asyncHandler(async (req, res) => {
    await svc.unsubscribe(req.userId, req.body.endpoint);
    res.json({ ok: true });
  }),
);
