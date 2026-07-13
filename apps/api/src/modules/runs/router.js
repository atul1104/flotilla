/**
 * Run routes — /api/v1/agents/:agentId/runs, /api/v1/runs/:id (PLAN.md §7.1).
 * Dispatch + ingestion happen over the /daemon socket; these are read/cancel/
 * retry + the human-in-the-loop approval decision (Phase 5).
 */
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { decideApprovalSchema } from '@flotilla/shared';
import * as svc from './service.js';
import { prisma } from '../../lib/db.js';

export const router = Router();

async function membershipGuard(req, res, workspaceId) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_actorId: { workspaceId, actorId: req.actorId } },
  });
  if (!member) {
    res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    return null;
  }
  return member;
}

// GET /workspaces/:id/runs — cross-workspace run feed (Activity page, PLAN.md §9.1)
router.get(
  '/workspaces/:id/runs',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!(await membershipGuard(req, res, req.params.id))) return;
    res.json({ items: await svc.listRuns(req.params.id) });
  }),
);

// GET /agents/:agentId/runs
router.get(
  '/agents/:agentId/runs',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = await prisma.agent.findUnique({ where: { id: req.params.agentId } });
    if (!a) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    if (!(await membershipGuard(req, res, a.workspaceId))) return;
    res.json({ items: await svc.listRuns(a.workspaceId, a.id) });
  }),
);

// GET /runs/:runId
router.get(
  '/runs/:runId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const run = await prisma.agentRun.findUnique({ where: { id: req.params.runId } });
    if (!run) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    if (!(await membershipGuard(req, res, run.workspaceId))) return;
    res.json(await svc.getRun(run.workspaceId, run.id));
  }),
);

// GET /runs/:runId/events
router.get(
  '/runs/:runId/events',
  requireAuth,
  asyncHandler(async (req, res) => {
    const run = await prisma.agentRun.findUnique({ where: { id: req.params.runId } });
    if (!run) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    if (!(await membershipGuard(req, res, run.workspaceId))) return;
    const events = await prisma.runEvent.findMany({
      where: { runId: run.id },
      orderBy: { seq: 'asc' },
    });
    res.json({
      items: events.map((e) => ({
        seq: e.seq,
        type: e.type,
        payload: e.payload,
        createdAt: e.createdAt,
      })),
    });
  }),
);

// POST /runs/:runId/cancel
router.post(
  '/runs/:runId/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const run = await prisma.agentRun.findUnique({ where: { id: req.params.runId } });
    if (!run) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    if (!(await membershipGuard(req, res, run.workspaceId))) return;
    res.json(await svc.cancelRun(run.workspaceId, run.id));
  }),
);

// POST /runs/:runId/retry  — re-dispatch a finished run as a fresh attempt (Phase 5)
router.post(
  '/runs/:runId/retry',
  requireAuth,
  asyncHandler(async (req, res) => {
    const run = await prisma.agentRun.findUnique({ where: { id: req.params.runId } });
    if (!run) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    if (!(await membershipGuard(req, res, run.workspaceId))) return;
    res.status(201).json(await svc.retryRun(run.workspaceId, run.id));
  }),
);

// POST /approvals/:approvalId/decide  { decision: 'approved'|'denied' }  (Phase 5)
router.post(
  '/approvals/:approvalId/decide',
  requireAuth,
  validateBody(decideApprovalSchema),
  asyncHandler(async (req, res) => {
    const approval = await prisma.approval.findUnique({
      where: { id: req.params.approvalId },
      include: { run: true },
    });
    if (!approval) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    if (!(await membershipGuard(req, res, approval.run.workspaceId))) return;
    res.json(await svc.decideApproval(approval.id, req.body.decision, req.userId));
  }),
);
