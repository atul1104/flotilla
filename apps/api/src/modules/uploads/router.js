/**
 * Upload routes — /api/v1/uploads/* (PLAN.md §7.1). Presign + complete.
 */
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validateBody } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspaceMember } from '../../middleware/workspace.js';
import { z } from 'zod';
import * as svc from './service.js';

export const router = Router();

const presignSchema = z.object({
  filename: z.string().min(1).max(255),
  mime: z.string().min(1).max(100),
  size: z.number().int().positive(),
});

router.post(
  '/workspaces/:id/uploads/presign',
  requireAuth,
  requireWorkspaceMember,
  validateBody(presignSchema),
  asyncHandler(async (req, res) => {
    const result = await svc.createPresign({
      userId: req.userId,
      workspaceId: req.workspace.id,
      workspacePlan: req.workspace.plan,
      filename: req.body.filename,
      mime: req.body.mime,
      size: req.body.size,
    });
    res.status(201).json(result);
  }),
);

router.post(
  '/uploads/complete',
  requireAuth,
  validateBody(z.object({ attachmentId: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    await svc.completeUpload(req.body.attachmentId);
    res.json({ ok: true });
  }),
);

export { svc };
