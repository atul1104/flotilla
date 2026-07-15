/**
 * Agent routes — /api/v1/workspaces/:id/agents and /api/v1/agents/:id (PLAN.md §7.1).
 */
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validateBody } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspaceMember } from '../../middleware/workspace.js';
import { createAgentSchema, updateAgentSchema } from '@flotila-org/shared';
import * as svc from './service.js';
import * as runs from '../runs/service.js';

export const router = Router();

/**
 * Load an agent by id and authorize the caller as a member of its workspace.
 * The /agents/:agentId routes have no :workspace param so requireWorkspaceMember
 * can't apply — this is the inline equivalent. Returns the agent or null (after
 * sending 404/403). (Phase 5 authz: every /agents/:agentId mutation needs this.)
 */
async function loadAgentForMember(req, res) {
  const { prisma } = await import('../../lib/db.js');
  const a = await prisma.agent.findUnique({ where: { id: req.params.agentId } });
  if (!a) {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    return null;
  }
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_actorId: { workspaceId: a.workspaceId, actorId: req.actorId } },
  });
  if (!member) {
    res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    return null;
  }
  return a;
}

router.post(
  '/workspaces/:id/agents',
  requireAuth,
  requireWorkspaceMember,
  validateBody(createAgentSchema),
  asyncHandler(async (req, res) => {
    const agent = await svc.createAgent(req.workspace.id, req.actorId, req.body, {
      plan: req.workspace.plan,
    });
    res.status(201).json(agent);
  }),
);

router.get(
  '/workspaces/:id/agents',
  requireAuth,
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    res.json({ items: await svc.listAgents(req.workspace.id) });
  }),
);

router.get(
  '/agents/:agentId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = await loadAgentForMember(req, res);
    if (!a) return;
    res.json(await svc.getAgent(a.workspaceId, a.id));
  }),
);

router.patch(
  '/agents/:agentId',
  requireAuth,
  validateBody(updateAgentSchema),
  asyncHandler(async (req, res) => {
    const a = await loadAgentForMember(req, res);
    if (!a) return;
    res.json(await svc.updateAgent(a.workspaceId, a.id, req.body));
  }),
);

router.delete(
  '/agents/:agentId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = await loadAgentForMember(req, res);
    if (!a) return;
    await svc.deleteAgent(a.workspaceId, a.id);
    res.json({ ok: true });
  }),
);

// POST /agents/:agentId/test → fire a hello-world run (PLAN.md §7.1)
router.post(
  '/agents/:agentId/test',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = await loadAgentForMember(req, res);
    if (!a) return;
    const run = await runs.triggerRun({
      workspaceId: a.workspaceId,
      agentId: a.id,
      contextText: 'Say hello and introduce yourself in one sentence.',
    });
    res.status(201).json(run);
  }),
);
