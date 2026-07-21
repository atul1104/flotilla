/**
 * Git collaboration routes (GIT_COLLABORATION.md §Phase 1 API endpoints).
 *
 *   POST   /api/v1/agents/:agentId/github-config      set encrypted token + repo
 *   GET    /api/v1/agents/:agentId/github-config      read config (no token)
 *   GET    /api/v1/agents/:agentId/git-status         agent's current git status
 *   PATCH  /api/v1/tasks/:taskId/git-context          set task repo coordinates
 *   GET    /api/v1/tasks/:taskId/git-status           task git status + last op
 *   GET    /api/v1/tasks/:taskId/git-operations       audit trail
 *   POST   /api/v1/tasks/:taskId/git-operation        record a git operation
 *   GET    /api/v1/workspaces/:id/github-repos        repos wired in workspace
 */
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validateBody } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspaceMember } from '../../middleware/workspace.js';
import { prisma } from '../../lib/db.js';
import {
  githubConfigSchema,
  recordGitOperationSchema,
  taskGitContextSchema,
} from '@atul1104/shared';
import * as svc from './service.js';
import { getRealtime } from '../../realtime/index.js';
import { maybeTriggerGitHandoff } from './handoff.js';

export const router = Router();

function forbidden(res) {
  return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
}
function notFound(res) {
  return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
}

/** Load an agent + verify the caller is a member of its workspace. */
async function loadAgentForMember(req, res) {
  const a = await prisma.agent.findUnique({ where: { id: req.params.agentId } });
  if (!a) {
    notFound(res);
    return null;
  }
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_actorId: { workspaceId: a.workspaceId, actorId: req.actorId } },
  });
  if (!member) {
    forbidden(res);
    return null;
  }
  return a;
}

/** Load a task + verify the caller is a member of its workspace. */
async function loadTaskForMember(req, res) {
  const t = await prisma.task.findUnique({ where: { id: req.params.taskId } });
  if (!t) {
    notFound(res);
    return null;
  }
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_actorId: { workspaceId: t.workspaceId, actorId: req.actorId } },
  });
  if (!member) {
    forbidden(res);
    return null;
  }
  return t;
}

// POST /agents/:agentId/github-config
router.post(
  '/agents/:agentId/github-config',
  requireAuth,
  validateBody(githubConfigSchema),
  asyncHandler(async (req, res) => {
    const a = await loadAgentForMember(req, res);
    if (!a) return;
    res.json(await svc.setGithubConfig(a.workspaceId, a.id, req.body));
  }),
);

// GET /agents/:agentId/github-config
router.get(
  '/agents/:agentId/github-config',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = await loadAgentForMember(req, res);
    if (!a) return;
    res.json(await svc.getGithubConfig(a.workspaceId, a.id));
  }),
);

// GET /agents/:agentId/git-status  (Phase 3 bridge: agent-card dashboard data)
router.get(
  '/agents/:agentId/git-status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = await loadAgentForMember(req, res);
    if (!a) return;
    res.json(await svc.getAgentGitStatus(a.workspaceId, a.id));
  }),
);

// PATCH /tasks/:taskId/git-context
router.patch(
  '/tasks/:taskId/git-context',
  requireAuth,
  validateBody(taskGitContextSchema),
  asyncHandler(async (req, res) => {
    const t = await loadTaskForMember(req, res);
    if (!t) return;
    res.json(await svc.setTaskGitContext(t.workspaceId, t.id, req.body));
  }),
);

// GET /tasks/:taskId/git-status
router.get(
  '/tasks/:taskId/git-status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const t = await loadTaskForMember(req, res);
    if (!t) return;
    res.json(await svc.getTaskGitStatus(t.workspaceId, t.id));
  }),
);

// GET /tasks/:taskId/git-operations
router.get(
  '/tasks/:taskId/git-operations',
  requireAuth,
  asyncHandler(async (req, res) => {
    const t = await loadTaskForMember(req, res);
    if (!t) return;
    res.json({ items: await svc.listGitOperations(t.workspaceId, t.id) });
  }),
);

// POST /tasks/:taskId/git-operation
router.post(
  '/tasks/:taskId/git-operation',
  requireAuth,
  validateBody(recordGitOperationSchema),
  asyncHandler(async (req, res) => {
    const t = await loadTaskForMember(req, res);
    if (!t) return;
    const op = await svc.recordGitOperation(t.workspaceId, t.id, req.body);
    // Phase 3 bridge: broadcast the op to workspace clients.
    getRealtime()?.broadcastGitOperation(t.workspaceId, op);
    // Phase 4: PR/tests_passed ops hand off to the next agent in the workflow.
    await maybeTriggerGitHandoff(t.workspaceId, t, op);
    res.status(201).json(op);
  }),
);

// GET /workspaces/:id/github-repos
router.get(
  '/workspaces/:id/github-repos',
  requireAuth,
  requireWorkspaceMember,
  asyncHandler(async (req, res) => {
    res.json({ items: await svc.listWorkspaceRepos(req.workspace.id) });
  }),
);
