/**
 * Task routes — /api/v1/workspaces/:id/tasks and /api/v1/tasks/:id (PLAN.md §7.1).
 * Status lifecycle, claim/handoff/complete, list (board data), audit trail.
 */
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspaceMember } from '../../middleware/workspace.js';
import {
  createTaskSchema,
  updateTaskSchema,
  handoffSchema,
  taskQuerySchema,
} from '@atul1104/shared';
import * as svc from './service.js';
import { serializeMessage } from '../messages/service.js';
import * as runs from '../runs/service.js';
import { getRealtime } from '../../realtime/index.js';
import { prisma } from '../../lib/db.js';

export const router = Router();

const forbidden = (res, msg = 'Forbidden') =>
  res.status(403).json({ error: msg, code: 'FORBIDDEN' });
const notFound = (res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });

function broadcast(workspaceId, task, kind) {
  getRealtime()?.broadcastTask(workspaceId, task, kind);
}

/**
 * Phase 5 — assigning a task to an AGENT triggers a run bound to that task
 * (PLAN.md §8.4 "task assignment or claim → agent works the task's thread").
 * Human→human assignment does nothing. Fire-and-forget; a refused run (cap) is
 * surfaced by the runs layer, not here.
 */
async function maybeTriggerAgentAssignee(workspaceId, task, prevAssigneeId) {
  if (!task.assigneeId || task.assigneeId === prevAssigneeId) return;
  const agent = await prisma.agent.findFirst({ where: { actorId: task.assigneeId, workspaceId } });
  if (!agent) return; // human assignee — nothing to do
  const threadMsgId = task.rootMessageId ?? null;
  runs
    .triggerRun({
      workspaceId,
      agentId: agent.id,
      taskId: task.id,
      triggerMessageId: threadMsgId,
      contextText: task.description || `Work the task: ${task.title}`,
      trigger: 'task',
    })
    .catch(() => {});
}

/** Load a task + verify the caller's membership. Sends 404/403 and returns null on failure. */
async function loadTaskForActor(req, res) {
  const t = await prisma.task.findUnique({ where: { id: req.params.taskId } });
  if (!t) {
    notFound(res);
    return null;
  }
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_actorId: { workspaceId: t.workspaceId, actorId: req.actorId } },
  });
  if (!membership) {
    forbidden(res);
    return null;
  }
  return { task: t, membership };
}

// POST /workspaces/:id/tasks
router.post(
  '/workspaces/:id/tasks',
  requireAuth,
  requireWorkspaceMember,
  validateBody(createTaskSchema),
  asyncHandler(async (req, res) => {
    const task = await svc.createTask({
      workspaceId: req.workspace.id,
      createdById: req.actorId,
      ...req.body,
    });
    broadcast(req.workspace.id, task, 'created');
    // The card message it posted in chat is broadcast so chat updates live.
    if (task.channelId && task.rootMessageId) {
      const msg = await prisma.message.findUnique({
        where: { id: task.rootMessageId },
        include: { sender: { include: { user: true } }, reactions: true },
      });
      if (msg) {
        getRealtime()?.broadcastMessage(
          req.workspace.id,
          task.channelId,
          serializeMessage(msg),
          [],
        );
      }
    }
    if (task.assigneeId) await maybeTriggerAgentAssignee(req.workspace.id, task, null);
    res.status(201).json(task);
  }),
);

// GET /workspaces/:id/tasks?status=&assignee=
router.get(
  '/workspaces/:id/tasks',
  requireAuth,
  requireWorkspaceMember,
  validateQuery(taskQuerySchema),
  asyncHandler(async (req, res) => {
    const tasks = await svc.listTasks(req.workspace.id, {
      status: req.query.status,
      assigneeId: req.query.assigneeId,
    });
    res.json({ items: tasks });
  }),
);

// GET /tasks/:taskId
router.get(
  '/tasks/:taskId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ctx = await loadTaskForActor(req, res);
    if (!ctx) return;
    res.json(await svc.getTask(ctx.task.workspaceId, ctx.task.id));
  }),
);

// PATCH /tasks/:taskId
router.patch(
  '/tasks/:taskId',
  requireAuth,
  validateBody(updateTaskSchema),
  asyncHandler(async (req, res) => {
    const ctx = await loadTaskForActor(req, res);
    if (!ctx) return;
    if (!svc.canMutateTask(ctx.task, ctx.membership, req.actorId)) {
      return forbidden(res, 'You can only edit tasks you created or are assigned');
    }
    const prevAssigneeId = ctx.task.assigneeId;
    const task = await svc.updateTask(ctx.task.workspaceId, ctx.task.id, req.actorId, req.body);
    broadcast(ctx.task.workspaceId, task, 'updated');
    await maybeTriggerAgentAssignee(ctx.task.workspaceId, task, prevAssigneeId);
    res.json(task);
  }),
);

// POST /tasks/:taskId/claim
router.post(
  '/tasks/:taskId/claim',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ctx = await loadTaskForActor(req, res);
    if (!ctx) return;
    const task = await svc.claimTask(ctx.task.workspaceId, ctx.task.id, req.actorId);
    broadcast(ctx.task.workspaceId, task, 'updated');
    res.json(task);
  }),
);

// POST /tasks/:taskId/handoff { toActorId }
router.post(
  '/tasks/:taskId/handoff',
  requireAuth,
  validateBody(handoffSchema),
  asyncHandler(async (req, res) => {
    const ctx = await loadTaskForActor(req, res);
    if (!ctx) return;
    if (!svc.canMutateTask(ctx.task, ctx.membership, req.actorId)) {
      return forbidden(res, 'Only the creator or assignee can hand off a task');
    }
    const task = await svc.handoffTask(
      ctx.task.workspaceId,
      ctx.task.id,
      req.body.toActorId,
      req.actorId,
    );
    broadcast(ctx.task.workspaceId, task, 'updated');
    await maybeTriggerAgentAssignee(ctx.task.workspaceId, task, ctx.task.assigneeId);
    res.json(task);
  }),
);

// POST /tasks/:taskId/complete
router.post(
  '/tasks/:taskId/complete',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ctx = await loadTaskForActor(req, res);
    if (!ctx) return;
    const task = await svc.completeTask(ctx.task.workspaceId, ctx.task.id, req.actorId);
    broadcast(ctx.task.workspaceId, task, 'updated');
    res.json(task);
  }),
);

// GET /tasks/:taskId/events  (audit trail)
router.get(
  '/tasks/:taskId/events',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ctx = await loadTaskForActor(req, res);
    if (!ctx) return;
    const events = await svc.listEvents(ctx.task.workspaceId, ctx.task.id);
    res.json({ items: events });
  }),
);
