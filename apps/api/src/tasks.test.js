/**
 * Phase 3 task integration tests: create (with chat card), list/board filter,
 * lifecycle (claim → running → done), handoff, audit trail, permissions,
 * tenant isolation (PLAN.md §6, §13).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { prisma } from './lib/db.js';

const app = createApp();
const A = request.agent(app);
const B = request.agent(app);
const stamp = () => Date.now().toString(36);

let workspaceId = null;
let generalId = null;
let taskId = null;

beforeAll(async () => {
  const emailA = `task-a-${stamp()}@t.co`;
  const emailB = `task-b-${stamp()}@t.co`;
  await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });

  const signup = await A.post('/api/v1/auth/signup').send({
    email: emailA,
    name: 'Tasker A',
    password: 'supersecret-1',
    workspaceName: 'Task Co',
  });
  workspaceId = signup.body.workspace.id;
  const ch = await A.get(`/api/v1/workspaces/${workspaceId}/channels`);
  generalId = ch.body.items.find((c) => c.name === 'general').id;

  const inv = await A.post(`/api/v1/workspaces/${workspaceId}/invites`).send({
    email: emailB,
    role: 'member',
  });
  const token = inv.body.link.split('/invite/')[1];
  await B.post(`/api/v1/invites/${token}/accept`).send({
    name: 'Tasker B',
    password: 'supersecret-2',
  });
});

describe('task lifecycle', () => {
  it('creates a task with a chat card + thread root', async () => {
    const res = await A.post(`/api/v1/workspaces/${workspaceId}/tasks`).send({
      title: 'Ship the board',
      description: 'Kanban over tasks',
      channelId: generalId,
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('backlog');
    expect(res.body.rootMessageId).toBeTruthy();
    taskId = res.body.id;

    // The card message exists in the channel.
    const msgs = await A.get(`/api/v1/channels/${generalId}/messages`);
    expect(msgs.body.items.some((m) => m.payload?.taskId === taskId)).toBe(true);
  });

  it('lists tasks (board data) + filters by status', async () => {
    const all = await A.get(`/api/v1/workspaces/${workspaceId}/tasks`);
    expect(all.body.items.length).toBeGreaterThanOrEqual(1);
    const backlog = await A.get(`/api/v1/workspaces/${workspaceId}/tasks?status=backlog`);
    expect(backlog.body.items.every((t) => t.status === 'backlog')).toBe(true);
  });

  it('B claims the task → status claimed, assigned to B', async () => {
    const res = await B.post(`/api/v1/tasks/${taskId}/claim`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('claimed');
    expect(res.body.assignee).toBeTruthy();
  });

  it('moves through running → needs_review → done', async () => {
    expect((await A.patch(`/api/v1/tasks/${taskId}`).send({ status: 'running' })).body.status).toBe(
      'running',
    );
    expect(
      (await A.patch(`/api/v1/tasks/${taskId}`).send({ status: 'needs_review' })).body.status,
    ).toBe('needs_review');
    const done = await A.post(`/api/v1/tasks/${taskId}/complete`);
    expect(done.body.status).toBe('done');
    expect(done.body.completedAt).toBeTruthy();
  });

  it('records an audit trail of every change', async () => {
    const res = await A.get(`/api/v1/tasks/${taskId}/events`);
    expect(res.status).toBe(200);
    const types = res.body.items.map((e) => e.type);
    expect(types).toContain('created');
    expect(types).toContain('claimed');
    expect(types.filter((t) => t === 'status_changed').length).toBeGreaterThanOrEqual(3);
  });

  it('hands off a task to another member', async () => {
    const meB = await B.get('/api/v1/auth/me');
    const members = await A.get(`/api/v1/workspaces/${workspaceId}/members`);
    const bActor = members.body.items.find((m) => m.userId === meB.body.user.id).actorId;
    // Reopen then hand to B
    await A.patch(`/api/v1/tasks/${taskId}`).send({ status: 'claimed' });
    const res = await A.post(`/api/v1/tasks/${taskId}/handoff`).send({ toActorId: bActor });
    expect(res.status).toBe(200);
    expect(res.body.assigneeId).toBe(bActor);
  });
});

describe('task permissions + isolation', () => {
  it('a non-member of the workspace cannot read the task (403)', async () => {
    const intruder = request.agent(app);
    await intruder.post('/api/v1/auth/signup').send({
      email: `task-x-${stamp()}@t.co`,
      name: 'X',
      password: 'supersecret-3',
      workspaceName: 'Other Co',
    });
    const res = await intruder.get(`/api/v1/tasks/${taskId}`);
    expect([403, 404]).toContain(res.status);
  });

  it('done/cancelled tasks cannot be claimed (409)', async () => {
    const t = await A.post(`/api/v1/workspaces/${workspaceId}/tasks`).send({
      title: 'finished one',
    });
    await A.patch(`/api/v1/tasks/${t.body.id}`).send({ status: 'done' });
    const res = await A.post(`/api/v1/tasks/${t.body.id}/claim`);
    expect(res.status).toBe(409);
  });
});
