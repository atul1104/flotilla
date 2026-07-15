/**
 * Phase 6 integration tests: notifications, web push, FTS search, usage
 * dashboard, agent team templates, scheduled tasks, and the workspace run feed
 * (PLAN.md §15). Supertest against createApp() — no port binding except for the
 * push VAPID path which is service-level.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { prisma } from './lib/db.js';
import { cronDue, parseCron } from '@flotila-org/shared';
import { fireScheduledTasks } from './modules/jobs/scheduled-tasks.js';
import { createNotification, listNotifications } from './modules/notifications/service.js';
import { search } from './modules/search/service.js';
import { getUsage } from './modules/usage/service.js';

const app = createApp();
const A = request.agent(app);
const B = request.agent(app);
const stamp = () => Date.now().toString(36);

let workspaceId = null;
let generalId = null;
let actorA = null;

beforeAll(async () => {
  const emailA = `p6-a-${stamp()}@t.co`;
  const emailB = `p6-b-${stamp()}@t.co`;
  await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });

  const signup = await A.post('/api/v1/auth/signup').send({
    email: emailA,
    name: 'P6 A',
    password: 'supersecret-1',
    workspaceName: 'P6 Co',
  });
  workspaceId = signup.body.workspace.id;
  // Bump to Pro so the agent-team + usage tests aren't blocked by the Free
  // 3-agent cap (those tests aren't about the cap — Phase 8 covers it).
  await prisma.workspace.update({ where: { id: workspaceId }, data: { plan: 'pro' } });
  const userA = await prisma.user.findUnique({
    where: { id: signup.body.user.id },
    include: { actor: true },
  });
  actorA = userA.actor;

  const ch = await A.get(`/api/v1/workspaces/${workspaceId}/channels`);
  generalId = ch.body.items.find((c) => c.name === 'general').id;

  const inv = await A.post(`/api/v1/workspaces/${workspaceId}/invites`).send({
    email: emailB,
    role: 'member',
  });
  const token = inv.body.link.split('/invite/')[1];
  await B.post(`/api/v1/invites/${token}/accept`).send({
    name: 'P6 B',
    password: 'supersecret-2',
  });
});

async function userAId() {
  const me = await A.get('/api/v1/auth/me');
  return me.body.user.id;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
describe('Phase 6: notifications', () => {
  it('creates + lists + marks read (per-user, tenant-scoped)', async () => {
    const userId = await userAId();
    await createNotification({
      userId,
      workspaceId,
      type: 'mention',
      payload: { title: 'hello', preview: 'p' },
    });
    const list = await listNotifications(userId);
    expect(list.unread).toBeGreaterThanOrEqual(1);
    expect(list.items.some((n) => n.payload?.title === 'hello')).toBe(true);

    const res = await A.post('/api/v1/notifications/read').send({});
    expect(res.status).toBe(200);
    const after = await listNotifications(userId);
    expect(after.unread).toBe(0);
  });

  it('B cannot read A’s notifications (per-user scoping)', async () => {
    const userId = await userAId();
    await createNotification({
      userId,
      workspaceId,
      type: 'task',
      payload: { title: 'private-to-a' },
    });
    const res = await B.get('/api/v1/notifications');
    expect(res.status).toBe(200);
    expect(res.body.items.some((n) => n.payload?.title === 'private-to-a')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Search (FTS + tenant isolation)
// ---------------------------------------------------------------------------
describe('Phase 6: search', () => {
  it('finds messages by FTS query, scoped to the workspace', async () => {
    // Post a distinctive message in #general.
    const needle = `uniqueterm-${stamp()}`;
    await A.post(`/api/v1/channels/${generalId}/messages`).send({
      content: `needle ${needle} here`,
    });

    const res = await A.get(`/api/v1/workspaces/${workspaceId}/search`).query({ q: needle });
    expect(res.status).toBe(200);
    expect(res.body.items.some((it) => it.type === 'message')).toBe(true);
  });

  it('finds tasks by title ILIKE', async () => {
    const needle = `taskterm-${stamp()}`;
    await A.post(`/api/v1/workspaces/${workspaceId}/tasks`).send({
      title: needle,
      description: 'searchable',
      channelId: generalId,
    });
    const res = await A.get(`/api/v1/workspaces/${workspaceId}/search`).query({ q: needle });
    expect(res.status).toBe(200);
    expect(res.body.items.some((it) => it.type === 'task')).toBe(true);
  });

  it('service-level search respects workspaceId (tenant isolation)', async () => {
    // A query for a term that exists in ws A, run against a bogus ws id → empty.
    const res = await search(workspaceId, 'general', undefined);
    expect(Array.isArray(res.items)).toBe(true);
    const cross = await search('00000000-0000-0000-0000-000000000000', 'general', undefined);
    expect(cross.items.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Usage dashboard
// ---------------------------------------------------------------------------
describe('Phase 6: usage dashboard', () => {
  it('returns totals + byDay + byAgent for the window', async () => {
    const res = await A.get(`/api/v1/workspaces/${workspaceId}/usage`).query({ days: 30 });
    expect(res.status).toBe(200);
    expect(res.body.totals).toBeDefined();
    expect(Array.isArray(res.body.byDay)).toBe(true);
    expect(Array.isArray(res.body.byAgent)).toBe(true);
    expect(res.body.windowDays).toBe(30);
  });

  it('accepts the max window (365) and rejects over-max (400)', async () => {
    const ok = await A.get(`/api/v1/workspaces/${workspaceId}/usage`).query({ days: 365 });
    expect(ok.status).toBe(200);
    expect(ok.body.windowDays).toBe(365);
    const bad = await A.get(`/api/v1/workspaces/${workspaceId}/usage`).query({ days: 99999 });
    expect(bad.status).toBe(400);
  });

  it('service-level getUsage aggregates a seeded run', async () => {
    // Create an agent + a finished run with tokens, then verify it shows up.
    const userId = await userAId();
    const agent = await prisma.agent.create({
      data: {
        workspaceId,
        name: 'UsageBot',
        handle: `usagebot-${stamp()}`,
        runtime: 'claude-code',
        createdBy: userId,
      },
    });
    const actor = await prisma.actor.create({ data: { kind: 'agent', agentId: agent.id } });
    await prisma.workspaceMember.create({
      data: { workspaceId, actorId: actor.id, role: 'agent' },
    });
    await prisma.agentRun.create({
      data: {
        workspaceId,
        agentId: agent.id,
        status: 'succeeded',
        tokensIn: 1000,
        tokensOut: 500,
        costEstimateCents: 12,
        queuedAt: new Date(),
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });
    const u = await getUsage(workspaceId, { days: 30 });
    expect(u.totals.runs).toBeGreaterThanOrEqual(1);
    expect(u.byAgent.some((a) => a.handle === agent.handle)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Agent team templates
// ---------------------------------------------------------------------------
describe('Phase 6: agent team templates', () => {
  it('lists the built-in templates', async () => {
    const res = await A.get(`/api/v1/workspaces/${workspaceId}/agent-templates`);
    expect(res.status).toBe(200);
    const ids = res.body.items.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['research', 'dev', 'support']));
  });

  it('creates a dev team (3 agents) in one POST', async () => {
    const res = await A.post(`/api/v1/workspaces/${workspaceId}/agent-teams`).send({
      template: 'dev',
    });
    expect(res.status).toBe(201);
    expect(res.body.agents.length).toBe(3);
    const handles = res.body.agents.map((a) => a.handle);
    expect(handles).toEqual(expect.arrayContaining(['coder', 'reviewer', 'qa']));
  });

  it('re-applying a template suffixes handles to avoid conflicts', async () => {
    const res = await A.post(`/api/v1/workspaces/${workspaceId}/agent-teams`).send({
      template: 'research',
    });
    expect(res.status).toBe(201);
    // First apply → 'researcher'; second apply below → 'researcher-2'.
    const res2 = await A.post(`/api/v1/workspaces/${workspaceId}/agent-teams`).send({
      template: 'research',
    });
    expect(res2.status).toBe(201);
    expect(res2.body.agents[0].handle).toMatch(/^researcher-\d+$/);
  });

  it('rejects an unknown template (400)', async () => {
    const res = await A.post(`/api/v1/workspaces/${workspaceId}/agent-teams`).send({
      template: 'nonexistent',
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Scheduled tasks (cron matcher + firing)
// ---------------------------------------------------------------------------
describe('Phase 6: scheduled tasks (cron)', () => {
  it('parseCron parses a 5-field expression', () => {
    const c = parseCron('0 9 * * 1-5');
    expect(c.minute.has(0)).toBe(true);
    expect(c.hour.has(9)).toBe(true);
    expect(c.dow.has(1)).toBe(true);
    expect(c.dow.has(6)).toBe(false);
  });

  it('cronDue matches a weekday 9am and skips same-minute re-fire', () => {
    const monday9am = new Date(2026, 6, 13, 9, 0, 0); // 2026-07-13 is a Monday
    expect(cronDue('0 9 * * 1-5', monday9am, null)).toBe(true);
    // Same minute as last fire → not due again.
    expect(cronDue('0 9 * * 1-5', monday9am, monday9am)).toBe(false);
    // Saturday → not due.
    const saturday9am = new Date(2026, 6, 18, 9, 0, 0);
    expect(cronDue('0 9 * * 1-5', saturday9am, null)).toBe(false);
  });

  it('fireScheduledTasks triggers a run for a due task with an agent assignee', async () => {
    // Create an agent + a task with a schedule due now, assigned to the agent.
    const userId = await userAId();
    const agent = await prisma.agent.create({
      data: {
        workspaceId,
        name: 'SchedBot',
        handle: `schedbot-${stamp()}`,
        runtime: 'claude-code',
        createdBy: userId,
      },
    });
    const actor = await prisma.actor.create({ data: { kind: 'agent', agentId: agent.id } });
    await prisma.workspaceMember.create({
      data: { workspaceId, actorId: actor.id, role: 'agent' },
    });
    const now = new Date();
    const task = await prisma.task.create({
      data: {
        workspaceId,
        channelId: generalId,
        title: 'scheduled job',
        status: 'backlog',
        createdById: actorA.id,
        assigneeId: actor.id,
        schedule: {
          cron: `${now.getMinutes()} ${now.getHours()} * * *`,
          lastFiredAt: null,
        },
      },
    });
    const fired = await fireScheduledTasks(now);
    expect(fired).toBeGreaterThanOrEqual(1);
    // The task’s lastFiredAt should now be set.
    const after = await prisma.task.findUnique({ where: { id: task.id } });
    expect(after.schedule.lastFiredAt).toBeTruthy();
    // A run should have been queued for the agent.
    const runs = await prisma.agentRun.findMany({
      where: { agentId: agent.id, taskId: task.id },
    });
    expect(runs.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Web push (VAPID + subscribe/unsubscribe)
// ---------------------------------------------------------------------------
describe('Phase 6: web push', () => {
  it('GET /push/vapid-public returns enabled flag + key (possibly null)', async () => {
    const res = await A.get('/api/v1/push/vapid-public');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('enabled');
  });

  it('POST /push/subscribe + DELETE round-trips a subscription', async () => {
    const endpoint = `https://push.example.com/sub-${stamp()}`;
    const sub = await A.post('/api/v1/push/subscribe').send({
      endpoint,
      keys: { p256dh: 'a'.repeat(20), auth: 'b'.repeat(10) },
    });
    expect(sub.status).toBe(201);
    const del = await A.delete('/api/v1/push/subscribe').send({ endpoint });
    expect(del.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Workspace run feed (Activity page)
// ---------------------------------------------------------------------------
describe('Phase 6: workspace run feed', () => {
  it('GET /workspaces/:id/runs lists runs (membership-guarded)', async () => {
    const res = await A.get(`/api/v1/workspaces/${workspaceId}/runs`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});
