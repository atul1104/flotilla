/**
 * Task business logic (PLAN.md §6, §7.1, §8.4). Lifecycle, claim/handoff/
 * complete, audit trail (task_events), and task-cards-in-chat (a payload
 * message acts as the task's discussion thread root).
 */
import { prisma } from '../../lib/db.js';
import { NotFoundError, ConflictError } from '@atul1104/shared';
import { TASK_STATUS } from '@atul1104/shared';

function serializeActor(actor) {
  if (!actor) return null;
  return {
    id: actor.id,
    name: actor.user?.name ?? actor.handle ?? 'agent',
    kind: actor.kind,
  };
}

export function serializeTask(t) {
  return {
    id: t.id,
    workspaceId: t.workspaceId,
    channelId: t.channelId,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    createdById: t.createdById,
    createdBy: serializeActor(t.createdBy),
    assigneeId: t.assigneeId,
    assignee: serializeActor(t.assignee),
    rootMessageId: t.rootMessageId,
    dueAt: t.dueAt,
    schedule: t.schedule ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    completedAt: t.completedAt,
  };
}

async function assertInWorkspace(taskId, workspaceId) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.workspaceId !== workspaceId) throw new NotFoundError('Task not found');
  return task;
}

async function recordEvent(tx, { taskId, actorId, type, payload = {} }) {
  await tx.taskEvent.create({ data: { taskId, actorId, type, payload } });
}

/** Create a task. If channelId is given, post a task-card message there and
 *  bind it as the task's discussion thread. */
export async function createTask({ workspaceId, createdById, channelId, ...fields }) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        workspaceId,
        channelId: channelId ?? null,
        createdById,
        title: fields.title,
        description: fields.description ?? null,
        assigneeId: fields.assigneeId ?? null,
        priority: fields.priority ?? 2,
        dueAt: fields.dueAt ?? null,
        schedule: fields.schedule ?? null,
        status: TASK_STATUS.BACKLOG,
      },
      include: { createdBy: { include: { user: true } }, assignee: { include: { user: true } } },
    });

    // Task-card message in the channel (its thread = where work happens).
    if (channelId) {
      const card = await tx.message.create({
        data: {
          channelId,
          senderId: createdById,
          content: `**Task:** ${task.title}`,
          payload: { type: 'task_card', taskId: task.id, status: task.status },
        },
      });
      await tx.task.update({ where: { id: task.id }, data: { rootMessageId: card.id } });
      task.rootMessageId = card.id;
    }

    await recordEvent(tx, { taskId: task.id, actorId: createdById, type: 'created' });
    return serializeTask(task);
  });
}

export async function listTasks(workspaceId, { status, assigneeId } = {}) {
  const tasks = await prisma.task.findMany({
    where: {
      workspaceId,
      ...(status ? { status } : {}),
      ...(assigneeId ? { assigneeId } : {}),
    },
    include: { createdBy: { include: { user: true } }, assignee: { include: { user: true } } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  });
  return tasks.map(serializeTask);
}

export async function getTask(workspaceId, taskId) {
  await assertInWorkspace(taskId, workspaceId);
  const full = await prisma.task.findUnique({
    where: { id: taskId },
    include: { createdBy: { include: { user: true } }, assignee: { include: { user: true } } },
  });
  return serializeTask(full);
}

export async function listEvents(workspaceId, taskId) {
  await assertInWorkspace(taskId, workspaceId);
  return prisma.taskEvent.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function updateTask(workspaceId, taskId, actorId, patch) {
  const existing = await assertInWorkspace(taskId, workspaceId);
  return prisma.$transaction(async (tx) => {
    const data = {};
    const events = [];
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.priority !== undefined) data.priority = patch.priority;
    if (patch.dueAt !== undefined) data.dueAt = patch.dueAt;
    if (patch.schedule !== undefined) data.schedule = patch.schedule;
    if (patch.status !== undefined && patch.status !== existing.status) {
      data.status = patch.status;
      if (patch.status === TASK_STATUS.DONE) data.completedAt = new Date();
      else if (existing.status === TASK_STATUS.DONE) data.completedAt = null;
      events.push({ type: 'status_changed', payload: { from: existing.status, to: patch.status } });
    }
    if (patch.assigneeId !== undefined && patch.assigneeId !== existing.assigneeId) {
      data.assigneeId = patch.assigneeId; // null = unassign
      events.push({
        type: 'assigned',
        payload: { from: existing.assigneeId, to: patch.assigneeId },
      });
    }
    const task = await tx.task.update({
      where: { id: taskId },
      data,
      include: { createdBy: { include: { user: true } }, assignee: { include: { user: true } } },
    });
    for (const e of events) await recordEvent(tx, { taskId, actorId, ...e });
    // Sync the card message status, if any.
    if (task.rootMessageId && data.status) {
      await tx.message.update({
        where: { id: task.rootMessageId },
        data: { payload: { type: 'task_card', taskId: task.id, status: task.status } },
      });
    }
    return serializeTask(task);
  });
}

export async function claimTask(workspaceId, taskId, actorId) {
  const existing = await assertInWorkspace(taskId, workspaceId);
  if (existing.status === TASK_STATUS.DONE || existing.status === TASK_STATUS.CANCELLED) {
    throw new ConflictError('Task is already finished');
  }
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.update({
      where: { id: taskId },
      data: { assigneeId: actorId, status: TASK_STATUS.CLAIMED },
      include: { createdBy: { include: { user: true } }, assignee: { include: { user: true } } },
    });
    await recordEvent(tx, {
      taskId,
      actorId,
      type: 'claimed',
      payload: { from: existing.assigneeId },
    });
    return serializeTask(task);
  });
}

/** Hand a task to another actor (reassign + move to claimed). Agent→agent
 *  handoff with subtask creation is layered on in Phase 5. */
export async function handoffTask(workspaceId, taskId, toActorId, actorId) {
  return updateTask(workspaceId, taskId, actorId, {
    assigneeId: toActorId,
    status: TASK_STATUS.CLAIMED,
  });
}

/**
 * Phase 5 handoff subtask (PLAN.md §8.4): an agent handing work to another agent
 * creates a child task under the parent, assigned to the recipient and rooted at
 * the handoff message. Used by runs.triggerForMentions. Status starts CLAIMED so
 * it shows on the board as in-flight; the recipient agent's run will move it.
 */
export async function createSubtask({
  workspaceId,
  parentId,
  channelId,
  title,
  assigneeActorId,
  rootMessageId,
  description = null,
}) {
  const parent = await prisma.task.findUnique({ where: { id: parentId } });
  if (!parent || parent.workspaceId !== workspaceId) throw new NotFoundError('Task not found');
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        workspaceId,
        channelId: channelId ?? parent.channelId ?? null,
        createdById: parent.createdById,
        parentTaskId: parentId,
        title,
        description,
        assigneeId: assigneeActorId ?? null,
        priority: parent.priority,
        status: TASK_STATUS.CLAIMED,
        rootMessageId: rootMessageId ?? null,
      },
      include: { createdBy: { include: { user: true } }, assignee: { include: { user: true } } },
    });
    await recordEvent(tx, {
      taskId: task.id,
      actorId: assigneeActorId ?? parent.createdById,
      type: 'created',
      payload: { parentId, handoff: true },
    });
    return serializeTask(task);
  });
}

export async function completeTask(workspaceId, taskId, actorId) {
  return updateTask(workspaceId, taskId, actorId, { status: TASK_STATUS.DONE });
}

/** Guard: only the creator or assignee may mutate a task (admins too). */
export function canMutateTask(task, membership, actorId) {
  if (membership.role === 'owner' || membership.role === 'admin') return true;
  return task.createdById === actorId || task.assigneeId === actorId;
}
