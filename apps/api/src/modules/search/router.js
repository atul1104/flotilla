/**
 * Search routes — /api/v1/workspaces/:id/search (PLAN.md §7.1, Phase 6 FTS).
 */
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspaceMember } from '../../middleware/workspace.js';
import { validateQuery } from '../../middleware/validate.js';
import { searchQuerySchema } from '@atul1104/shared';
import * as svc from './service.js';

export const router = Router();

router.get(
  '/workspaces/:id/search',
  requireAuth,
  requireWorkspaceMember,
  validateQuery(searchQuerySchema),
  asyncHandler(async (req, res) => {
    res.json(await svc.search(req.workspace.id, req.query.q, req.query.type));
  }),
);
