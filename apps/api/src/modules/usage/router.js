/**
 * Usage routes — /api/v1/workspaces/:id/usage (PLAN.md §7.1). Tokens/cost/runs
 * dashboard data for the requested window.
 */
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspaceMember } from '../../middleware/workspace.js';
import { validateQuery } from '../../middleware/validate.js';
import { usageQuerySchema } from '@atul1104/shared';
import * as svc from './service.js';

export const router = Router();

router.get(
  '/workspaces/:id/usage',
  requireAuth,
  requireWorkspaceMember,
  validateQuery(usageQuerySchema),
  asyncHandler(async (req, res) => {
    res.json(await svc.getUsage(req.workspace.id, { days: req.query.days }));
  }),
);
