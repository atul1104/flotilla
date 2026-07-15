/**
 * Agent-team routes — /api/v1/workspaces/:id/agent-teams (improvement #5).
 */
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspaceMember } from '../../middleware/workspace.js';
import { validateBody } from '../../middleware/validate.js';
import { agentTeamSchema } from '@flotila-org/shared';
import * as svc from './service.js';

export const router = Router();

// GET /workspaces/:id/agent-templates — the available blueprints
router.get(
  '/workspaces/:id/agent-templates',
  requireAuth,
  requireWorkspaceMember,
  asyncHandler(async (_req, res) => {
    res.json({ items: svc.listTeamTemplates() });
  }),
);

// POST /workspaces/:id/agent-teams { template, computerId? }
router.post(
  '/workspaces/:id/agent-teams',
  requireAuth,
  requireWorkspaceMember,
  validateBody(agentTeamSchema),
  asyncHandler(async (req, res) => {
    const team = await svc.createAgentTeam(req.workspace.id, req.actorId, req.body, {
      plan: req.workspace.plan,
    });
    res.status(201).json(team);
  }),
);
