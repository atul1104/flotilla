/**
 * Phase 5 E2E — multi-agent collaboration (PLAN.md §15). Fake daemon socket
 * clients drive the same dispatch/ingest paths the real daemon uses:
 *   - agent→agent handoff (chain depth + subtask + self-trigger guard)
 *   - chain-depth + hourly loop caps
 *   - approval gate (request → human decide → resume)
 *   - run retry
 *   - task→agent assignment triggers a run
 * Style mirrors agents.test.js (the Phase 4 demo test).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { io } from 'socket.io-client';
import { createApp } from './app.js';
import { initRealtime } from './realtime/index.js';
import { DAEMON_SOCKET_EVENTS as D, AGENT_LOOP_LIMITS } from '@flotila-org/shared';
import { prisma } from './lib/db.js';

const stamp = () => Date.now().toString(36);
const BASE = () => `http://127.0.0.1:${port}`;
let port;

const app = createApp();
const server = http.createServer(app);
const rt = initRealtime(server, true);

beforeAll(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
afterAll(async () => {
  await new Promise((r) => rt.io.close(r));
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
});

function cookieJar(res) {
  const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return set.map((c) => c.split(';')[0]).join('; ');
}
async function fetchJson(path, opts = {}) {
  const res = await fetch(BASE() + path, opts);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, cookie: cookieJar(res) };
}
const json = (body, cookie) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
});
const patch = (cookie) => ({
  method: 'PATCH',
  headers: { 'content-type': 'application/json', cookie },
});

// Shared setup: owner + workspace + #general + an online computer + N agents.
async function setup(cookie, wsId, handles) {
  const ch = await fetchJson(`/api/v1/workspaces/${wsId}/channels`, { headers: { cookie } });
  const general = ch.body.items.find((c) => c.name === 'general').id;
  const code = await fetchJson(
    `/api/v1/workspaces/${wsId}/computers/pairing-code`,
    json({}, cookie),
  );
  const pair = await fetchJson(
    '/api/v1/daemon/pair',
    json({ code: code.body.code, name: 'laptop' }),
  );
  const computerId = pair.body.computerId;
  const deviceToken = pair.body.deviceToken;
  const agents = {};
  for (const handle of handles) {
    const a = await fetchJson(
      `/api/v1/workspaces/${wsId}/agents`,
      json({ name: handle, handle, runtime: 'claude-code' }, cookie),
    );
    await fetchJson(`/api/v1/agents/${a.body.id}`, {
      ...patch(cookie),
      body: JSON.stringify({ computerId }),
    });
    agents[handle] = a.body;
  }
  return { general, computerId, deviceToken, agents };
}

function connectDaemon(deviceToken) {
  return io(`${BASE()}/daemon`, {
    transports: ['polling'],
    auth: { token: deviceToken, platform: 'darwin', daemonVersion: 'test' },
  });
}

// A daemon that, per agent handle, runs a scripted reply. `script(handle)`
// returns { mention?, artifact?, approval? } describing the Phase 5 behaviors.
function scriptedDaemon(sock, script) {
  return new Promise((resolve) => {
    const runs = {};
    sock.on(D.RUN_DISPATCH, async (ctx) => {
      const { runId, agent } = ctx;
      runs[runId] = { handle: agent.handle };
      const s = script(agent.handle, ctx) || {};
      sock.emit(D.RUN_EVENT, { runId, seq: 1, type: 'thinking', payload: { text: '…' } });

      if (s.artifact) {
        sock.emit(D.RUN_MESSAGE, {
          runId,
          content: 'My changes:',
          payload: { type: 'artifact', artifactType: 'diff', content: s.artifact },
        });
      }
      if (s.approval) {
        sock.emit(D.RUN_EVENT, {
          runId,
          seq: 2,
          type: 'approval_request',
          payload: { action: s.approval.action, label: s.approval.label, risk: 'medium' },
        });
        // Wait for the server's approval.decision before finishing.
        const decided = new Promise((res) => {
          const onDecide = (d) => {
            if (d.runId === runId) {
              sock.off(D.APPROVAL_DECISION, onDecide);
              res(d.decision);
            }
          };
          sock.on(D.APPROVAL_DECISION, onDecide);
        });
        const decision = await decided;
        sock.emit(D.RUN_MESSAGE, {
          runId,
          content: decision === 'approved' ? '✅ approved' : '🛑 denied',
        });
      }
      if (s.mention) {
        sock.emit(D.RUN_MESSAGE, { runId, content: `@${s.mention} please take a look` });
      }
      sock.emit(D.RUN_EVENT, { runId, seq: 9, type: 'final', payload: {} });
      sock.emit(D.RUN_FINISHED, {
        runId,
        status: 'succeeded',
        usage: { tokensIn: 1, tokensOut: 2 },
      });
    });
    resolve(runs);
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Poll an async getter until it returns truthy (or timeout). Keeps the polling
 *  transport E2E deterministic without brittle fixed waits. */
async function waitFor(fn, timeout = 6000, interval = 150) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const r = await fn();
    if (r) return r;
    await wait(interval);
  }
  throw new Error('waitFor timed out');
}

describe('Phase 5: agent→agent handoff (the multi-agent magic)', () => {
  it('an agent mentioning another agent triggers a chained run + subtask', async () => {
    const email = `p5-handoff-${stamp()}@t.co`;
    await prisma.user.deleteMany({ where: { email } });
    const signup = await fetchJson(
      '/api/v1/auth/signup',
      json({ email, name: 'Owner', password: 'supersecret-1', workspaceName: 'Handoff Co' }),
    );
    const cookie = signup.cookie;
    const wsId = signup.body.workspace.id;
    const { general, deviceToken, agents } = await setup(cookie, wsId, ['coder', 'reviewer']);

    const sock = connectDaemon(deviceToken);
    await new Promise((r, s) => {
      sock.on('connect', r);
      sock.on('connect_error', s);
    });
    scriptedDaemon(sock, (handle) =>
      handle === 'coder' ? { mention: 'reviewer' } : { artifact: '+ review done' },
    );

    // Assigning a task to coder fires a task-bound run; coder hands off to
    // reviewer, which creates a subtask + a chained run. (PLAN.md §8.4.)
    const task = await fetchJson(
      `/api/v1/workspaces/${wsId}/tasks`,
      json(
        { title: 'Build feature', channelId: general, assigneeId: agents.coder.actorId },
        cookie,
      ),
    );
    expect(task.status).toBe(201);

    const coderRun = await waitFor(async () => {
      const r = await fetchJson(`/api/v1/agents/${agents.coder.id}/runs`, { headers: { cookie } });
      return r.body.items[0];
    });

    // reviewer's run chains off coder's run.
    const chained = await waitFor(async () => {
      const r = await fetchJson(`/api/v1/agents/${agents.reviewer.id}/runs`, {
        headers: { cookie },
      });
      return r.body.items[0];
    });
    expect(chained.parentRunId).toBe(coderRun.id);
    expect(chained.chainDepth).toBe(1);
    expect(chained.trigger).toBe('handoff');
    await waitFor(async () => {
      const r = await fetchJson(`/api/v1/runs/${chained.id}`, { headers: { cookie } });
      return r.body.status === 'succeeded';
    });

    // A subtask was created for the handoff, assigned to reviewer under the task.
    const tasks = await fetchJson(`/api/v1/workspaces/${wsId}/tasks`, { headers: { cookie } });
    const sub = tasks.body.items.find((t) => t.assigneeId === agents.reviewer.actorId);
    expect(sub).toBeTruthy();
    expect(sub.title).toContain('reviewer');

    sock.disconnect();
  }, 20000);

  it('never triggers itself on a self-mention (loop guard)', async () => {
    const email = `p5-self-${stamp()}@t.co`;
    await prisma.user.deleteMany({ where: { email } });
    const signup = await fetchJson(
      '/api/v1/auth/signup',
      json({ email, name: 'Owner', password: 'supersecret-1', workspaceName: 'Self Co' }),
    );
    const cookie = signup.cookie;
    const wsId = signup.body.workspace.id;
    const { deviceToken, agents } = await setup(cookie, wsId, ['solo']);

    const sock = connectDaemon(deviceToken);
    await new Promise((r, s) => {
      sock.on('connect', r);
      sock.on('connect_error', s);
    });
    scriptedDaemon(sock, () => ({ mention: 'solo' })); // solo mentions itself

    const run = await fetchJson(`/api/v1/agents/${agents.solo.id}/test`, json({}, cookie));
    expect(run.status).toBe(201);
    // Wait for the self-mention to be processed, then assert no second run fired.
    await wait(1200);

    const runs = await fetchJson(`/api/v1/agents/${agents.solo.id}/runs`, { headers: { cookie } });
    expect(runs.body.items.length).toBe(1); // only the original — no self-chain
    sock.disconnect();
  }, 15000);
});

describe('Phase 5: loop-safety caps', () => {
  it('refuses a handoff beyond MAX_CHAIN_DEPTH and posts a blocked note', async () => {
    const email = `p5-cap-${stamp()}@t.co`;
    await prisma.user.deleteMany({ where: { email } });
    const signup = await fetchJson(
      '/api/v1/auth/signup',
      json({ email, name: 'Owner', password: 'supersecret-1', workspaceName: 'Cap Co' }),
    );
    const cookie = signup.cookie;
    const wsId = signup.body.workspace.id;
    const { general, computerId, deviceToken, agents } = await setup(cookie, wsId, [
      'deep',
      'sink',
    ]);

    // Seed a parent run already at the cap (no triggerMessage → its handoff +
    // the blocked note land top-level in #general). A handoff from it exceeds depth.
    const parent = await prisma.agentRun.create({
      data: {
        agentId: agents.deep.id,
        computerId,
        workspaceId: wsId,
        chainDepth: AGENT_LOOP_LIMITS.MAX_CHAIN_DEPTH,
        trigger: 'mention',
        status: 'running',
        model: 'mock',
      },
    });

    const sock = connectDaemon(deviceToken);
    await new Promise((r, s) => {
      sock.on('connect', r);
      sock.on('connect_error', s);
    });
    // The deep run posts a handoff to @sink from the maxed-out parent.
    sock.on(D.RUN_DISPATCH, () => {}); // keep socket alive
    sock.emit(D.RUN_MESSAGE, {
      runId: parent.id,
      content: '@sink please continue',
    });

    // sink's run is never created (refused on chain depth)…
    await wait(1000);
    const sinkRuns = await fetchJson(`/api/v1/agents/${agents.sink.id}/runs`, {
      headers: { cookie },
    });
    expect(sinkRuns.body.items.length).toBe(0);

    // …and a blocked-handoff note is posted in the channel.
    const blocked = await waitFor(async () => {
      const msgs = await fetchJson(`/api/v1/channels/${general}/messages`, { headers: { cookie } });
      return msgs.body.items.find((m) => /Couldn't hand off to @sink/.test(m.content));
    });
    expect(blocked).toBeTruthy();
    sock.disconnect();
  }, 15000);

  it('refuses (429) once the workspace hourly run cap is hit', async () => {
    const email = `p5-hourly-${stamp()}@t.co`;
    await prisma.user.deleteMany({ where: { email } });
    const signup = await fetchJson(
      '/api/v1/auth/signup',
      json({ email, name: 'Owner', password: 'supersecret-1', workspaceName: 'Hourly Co' }),
    );
    const cookie = signup.cookie;
    const wsId = signup.body.workspace.id;
    const { agents } = await setup(cookie, wsId, ['busy']);

    // Fill the hourly budget with queued runs (no computer needed to hit the cap).
    const rows = Array.from({ length: AGENT_LOOP_LIMITS.RUNS_PER_HOUR_PER_WORKSPACE }, () => ({
      agentId: agents.busy.id,
      workspaceId: wsId,
      chainDepth: 0,
      trigger: 'test',
      status: 'queued',
      model: 'mock',
    }));
    await prisma.agentRun.createMany({ data: rows });

    const over = await fetchJson(`/api/v1/agents/${agents.busy.id}/test`, json({}, cookie));
    expect(over.status).toBe(429);
    expect(over.body.code).toBe('RUN_REFUSED');
    expect(over.body.details?.reason).toBe('hourly_cap');
  }, 15000);
});

describe('Phase 5: human-in-the-loop approval gate', () => {
  it('parks the run, posts an approval card, resumes on approve', async () => {
    const email = `p5-approve-${stamp()}@t.co`;
    await prisma.user.deleteMany({ where: { email } });
    const signup = await fetchJson(
      '/api/v1/auth/signup',
      json({ email, name: 'Owner', password: 'supersecret-1', workspaceName: 'Approve Co' }),
    );
    const cookie = signup.cookie;
    const wsId = signup.body.workspace.id;
    const { general, deviceToken, agents } = await setup(cookie, wsId, ['gate']);

    const sock = connectDaemon(deviceToken);
    await new Promise((r, s) => {
      sock.on('connect', r);
      sock.on('connect_error', s);
    });
    scriptedDaemon(sock, () => ({ approval: { action: 'run tests', label: 'npm test' } }));

    const run = await fetchJson(`/api/v1/agents/${agents.gate.id}/test`, json({}, cookie));
    expect(run.status).toBe(201);
    const runId = run.body.id;

    // The approval card appears in the channel + the run parks awaiting decision.
    const card = await waitFor(async () => {
      const msgs = await fetchJson(`/api/v1/channels/${general}/messages`, { headers: { cookie } });
      return msgs.body.items.find((m) => m.payload?.type === 'approval');
    });
    expect(card.payload.status).toBe('pending');
    await waitFor(async () => {
      const r = await fetchJson(`/api/v1/runs/${runId}`, { headers: { cookie } });
      return r.body.status === 'awaiting_approval';
    });

    // Human approves → run resumes + daemon finishes.
    const decision = await fetchJson(
      `/api/v1/approvals/${card.payload.approvalId}/decide`,
      json({ decision: 'approved' }, cookie),
    );
    expect(decision.status).toBe(200);
    expect(decision.body.decision).toBe('approved');

    await waitFor(async () => {
      const r = await fetchJson(`/api/v1/runs/${runId}`, { headers: { cookie } });
      return r.body.status === 'succeeded';
    });

    // The card flipped to approved.
    const msgs = await fetchJson(`/api/v1/channels/${general}/messages`, { headers: { cookie } });
    const flipped = msgs.body.items.find((m) => m.id === card.id);
    expect(flipped.payload.status).toBe('approved');
    sock.disconnect();
  }, 20000);

  it('rejects a decision from a non-member (tenant isolation)', async () => {
    const email = `p5-iso-${stamp()}@t.co`;
    await prisma.user.deleteMany({ where: { email } });
    const signup = await fetchJson(
      '/api/v1/auth/signup',
      json({ email, name: 'Owner', password: 'supersecret-1', workspaceName: 'Iso Co' }),
    );
    const cookie = signup.cookie;
    const wsId = signup.body.workspace.id;
    const { general, deviceToken, agents } = await setup(cookie, wsId, ['gate']);

    const sock = connectDaemon(deviceToken);
    await new Promise((r, s) => {
      sock.on('connect', r);
      sock.on('connect_error', s);
    });
    scriptedDaemon(sock, () => ({ approval: { action: 'run tests' } }));
    await fetchJson(`/api/v1/agents/${agents.gate.id}/test`, json({}, cookie));
    const card = await waitFor(async () => {
      const msgs = await fetchJson(`/api/v1/channels/${general}/messages`, { headers: { cookie } });
      return msgs.body.items.find((m) => m.payload?.type === 'approval');
    });

    // A stranger in another workspace tries to decide → 403.
    const other = await fetchJson(
      '/api/v1/auth/signup',
      json({
        email: `other-${stamp()}@t.co`,
        name: 'Stranger',
        password: 'supersecret-1',
        workspaceName: 'Other',
      }),
    );
    const strangerCookie = other.cookie;
    const res = await fetchJson(
      `/api/v1/approvals/${card.payload.approvalId}/decide`,
      json({ decision: 'approved' }, strangerCookie),
    );
    expect(res.status).toBe(403);
    sock.disconnect();
  }, 20000);
});

describe('Phase 5: run retry + task→agent assignment', () => {
  it('retries a finished run as a fresh attempt', async () => {
    const email = `p5-retry-${stamp()}@t.co`;
    await prisma.user.deleteMany({ where: { email } });
    const signup = await fetchJson(
      '/api/v1/auth/signup',
      json({ email, name: 'Owner', password: 'supersecret-1', workspaceName: 'Retry Co' }),
    );
    const cookie = signup.cookie;
    const wsId = signup.body.workspace.id;
    const { deviceToken, agents } = await setup(cookie, wsId, ['retry']);

    const sock = connectDaemon(deviceToken);
    await new Promise((r, s) => {
      sock.on('connect', r);
      sock.on('connect_error', s);
    });
    scriptedDaemon(sock, () => ({}));
    const first = await fetchJson(`/api/v1/agents/${agents.retry.id}/test`, json({}, cookie));
    await waitFor(async () => {
      const r = await fetchJson(`/api/v1/runs/${first.body.id}`, { headers: { cookie } });
      return r.body.status === 'succeeded';
    });

    const retry = await fetchJson(`/api/v1/runs/${first.body.id}/retry`, json({}, cookie));
    expect(retry.status).toBe(201);
    expect(retry.body.id).not.toBe(first.body.id);
    expect(retry.body.trigger).toBe('retry');
    expect(retry.body.chainDepth).toBe(0);
    await waitFor(async () => {
      const r = await fetchJson(`/api/v1/runs/${retry.body.id}`, { headers: { cookie } });
      return r.body.status === 'succeeded';
    });
    sock.disconnect();
  }, 15000);

  it('assigning a task to an agent triggers a task-bound run', async () => {
    const email = `p5-task-${stamp()}@t.co`;
    await prisma.user.deleteMany({ where: { email } });
    const signup = await fetchJson(
      '/api/v1/auth/signup',
      json({ email, name: 'Owner', password: 'supersecret-1', workspaceName: 'Task Co' }),
    );
    const cookie = signup.cookie;
    const wsId = signup.body.workspace.id;
    const { general, deviceToken, agents } = await setup(cookie, wsId, ['worker']);

    const sock = connectDaemon(deviceToken);
    await new Promise((r, s) => {
      sock.on('connect', r);
      sock.on('connect_error', s);
    });
    scriptedDaemon(sock, () => ({}));

    // Create a task assigned directly to the agent → should fire a run.
    const task = await fetchJson(
      `/api/v1/workspaces/${wsId}/tasks`,
      json(
        { title: 'Do the thing', channelId: general, assigneeId: agents.worker.actorId },
        cookie,
      ),
    );
    expect(task.status).toBe(201);

    const run = await waitFor(async () => {
      const r = await fetchJson(`/api/v1/agents/${agents.worker.id}/runs`, { headers: { cookie } });
      return r.body.items[0];
    });
    expect(run.taskId).toBe(task.body.id);
    expect(run.trigger).toBe('task');
    sock.disconnect();
  }, 15000);
});

// ===========================================================================
// Phase 5 hardening — regression tests pinning the adversarial-review fixes.
// ===========================================================================
describe('Phase 5 hardening: cross-tenant agent mutation is blocked', () => {
  it("a non-member cannot PATCH/DELETE/test another workspace's agent", async () => {
    const aSignup = await fetchJson(
      '/api/v1/auth/signup',
      json({
        email: `hard-a-${stamp()}@t.co`,
        name: 'A',
        password: 'supersecret-1',
        workspaceName: 'Ws A',
      }),
    );
    const cookieA = aSignup.cookie;
    const wsA = aSignup.body.workspace.id;
    const { agents } = await setup(cookieA, wsA, ['secret']);
    const agentAId = agents.secret.id;

    // A separate user in a different workspace.
    const bSignup = await fetchJson(
      '/api/v1/auth/signup',
      json({
        email: `hard-b-${stamp()}@t.co`,
        name: 'B',
        password: 'supersecret-1',
        workspaceName: 'Ws B',
      }),
    );
    const cookieB = bSignup.cookie;

    const patch = await fetchJson(`/api/v1/agents/${agentAId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: cookieB },
      body: JSON.stringify({ approvalPolicy: { requireShellApproval: false } }),
    });
    expect(patch.status).toBe(403);
    const del = await fetchJson(`/api/v1/agents/${agentAId}`, {
      method: 'DELETE',
      headers: { cookie: cookieB },
    });
    expect(del.status).toBe(403);
    const test = await fetchJson(`/api/v1/agents/${agentAId}/test`, json({}, cookieB));
    expect(test.status).toBe(403);

    // The agent's approval policy is unchanged (cross-tenant write did not land).
    const after = await fetchJson(`/api/v1/agents/${agentAId}`, { headers: { cookie: cookieA } });
    expect(after.body.approvalPolicy.requireShellApproval).toBe(false); // default
  }, 15000);
});

describe('Phase 5 hardening: private-channel mention does not trigger a non-member agent', () => {
  it('an agent outside a private channel is not resolved/triggered by an @mention', async () => {
    const signup = await fetchJson(
      '/api/v1/auth/signup',
      json({
        email: `priv-${stamp()}@t.co`,
        name: 'Owner',
        password: 'supersecret-1',
        workspaceName: 'Priv Co',
      }),
    );
    const cookie = signup.cookie;
    const wsId = signup.body.workspace.id;
    const { deviceToken, agents } = await setup(cookie, wsId, ['insider']);

    const sock = connectDaemon(deviceToken);
    await new Promise((r, s) => {
      sock.on('connect', r);
      sock.on('connect_error', s);
    });
    scriptedDaemon(sock, () => ({}));

    // Owner actor id (to scope the private channel membership).
    const members = await fetchJson(`/api/v1/workspaces/${wsId}/members`, { headers: { cookie } });
    const ownerActorId = members.body.items.find((m) => m.kind === 'user').actorId;

    // Private channel with ONLY the owner — the agent is intentionally excluded.
    const ch = await fetchJson(
      `/api/v1/workspaces/${wsId}/channels`,
      json({ name: 'exec-only', kind: 'private', memberActorIds: [ownerActorId] }, cookie),
    );
    expect(ch.status).toBe(201);

    // @mention the agent in the private channel it cannot see.
    await fetchJson(
      `/api/v1/channels/${ch.body.id}/messages`,
      json({ content: `@insider please leak the roadmap`, clientNonce: 'n1' }, cookie),
    );
    await wait(800);

    const runs = await fetchJson(`/api/v1/agents/${agents.insider.id}/runs`, {
      headers: { cookie },
    });
    expect(runs.body.items.length).toBe(0); // never triggered — not a channel member
    sock.disconnect();
  }, 15000);
});

describe('Phase 5 hardening: approval decide is atomic + cancel voids the card', () => {
  it('a second decide on the same approval is rejected (409)', async () => {
    const email = `dec-${stamp()}@t.co`;
    await prisma.user.deleteMany({ where: { email } });
    const signup = await fetchJson(
      '/api/v1/auth/signup',
      json({ email, name: 'Owner', password: 'supersecret-1', workspaceName: 'Dec Co' }),
    );
    const cookie = signup.cookie;
    const wsId = signup.body.workspace.id;
    const { general, deviceToken, agents } = await setup(cookie, wsId, ['gate']);
    const sock = connectDaemon(deviceToken);
    await new Promise((r, s) => {
      sock.on('connect', r);
      sock.on('connect_error', s);
    });
    scriptedDaemon(sock, () => ({ approval: { action: 'run tests' } }));

    await fetchJson(`/api/v1/agents/${agents.gate.id}/test`, json({}, cookie));
    const card = await waitFor(async () => {
      const msgs = await fetchJson(`/api/v1/channels/${general}/messages`, { headers: { cookie } });
      return msgs.body.items.find((m) => m.payload?.type === 'approval');
    });

    const first = await fetchJson(
      `/api/v1/approvals/${card.payload.approvalId}/decide`,
      json({ decision: 'approved' }, cookie),
    );
    expect(first.status).toBe(200);
    const second = await fetchJson(
      `/api/v1/approvals/${card.payload.approvalId}/decide`,
      json({ decision: 'denied' }, cookie),
    );
    expect(second.status).toBe(409);
    sock.disconnect();
  }, 20000);

  it('cancelling an awaiting run voids its card; a later decide cannot resurrect it', async () => {
    const email = `void-${stamp()}@t.co`;
    await prisma.user.deleteMany({ where: { email } });
    const signup = await fetchJson(
      '/api/v1/auth/signup',
      json({ email, name: 'Owner', password: 'supersecret-1', workspaceName: 'Void Co' }),
    );
    const cookie = signup.cookie;
    const wsId = signup.body.workspace.id;
    const { general, deviceToken, agents } = await setup(cookie, wsId, ['gate']);
    const sock = connectDaemon(deviceToken);
    await new Promise((r, s) => {
      sock.on('connect', r);
      sock.on('connect_error', s);
    });
    scriptedDaemon(sock, () => ({ approval: { action: 'run tests' } }));
    const run = await fetchJson(`/api/v1/agents/${agents.gate.id}/test`, json({}, cookie));
    const card = await waitFor(async () => {
      const msgs = await fetchJson(`/api/v1/channels/${general}/messages`, { headers: { cookie } });
      return msgs.body.items.find((m) => m.payload?.type === 'approval');
    });

    // Cancel the parked run → its open approval is voided (card → 'cancelled').
    const cancel = await fetchJson(`/api/v1/runs/${run.body.id}/cancel`, json({}, cookie));
    expect(cancel.body.status).toBe('cancelled');

    const stale = await fetchJson(
      `/api/v1/approvals/${card.payload.approvalId}/decide`,
      json({ decision: 'approved' }, cookie),
    );
    expect(stale.status).toBe(409); // voided — no longer actionable

    // The run stays cancelled; the approve did not resurrect it to running.
    const after = await fetchJson(`/api/v1/runs/${run.body.id}`, { headers: { cookie } });
    expect(after.body.status).toBe('cancelled');
    sock.disconnect();
  }, 20000);
});

/** A daemon that holds runs open (no auto-finish) so we can inspect intermediate
 *  state + control draining. Returns helpers to emit events + finish a run. */
function holdingDaemon(sock) {
  sock.on(D.RUN_DISPATCH, (ctx) => {
    const { runId } = ctx || {};
    if (!runId) return;
    sock.emit(D.RUN_EVENT, { runId, seq: 1, type: 'thinking', payload: { text: '…' } });
  });
  return {
    raw: (ev, payload) => sock.emit(ev, payload),
    finish(runId, status = 'succeeded') {
      sock.emit(D.RUN_FINISHED, { runId, status, usage: { tokensIn: 1, tokensOut: 2 } });
    },
  };
}

describe('Phase 5 hardening: daemon cannot forge run status; one run per agent', () => {
  it('a status event cannot set a terminal status (allowlist)', async () => {
    const email = `allow-${stamp()}@t.co`;
    await prisma.user.deleteMany({ where: { email } });
    const signup = await fetchJson(
      '/api/v1/auth/signup',
      json({ email, name: 'Owner', password: 'supersecret-1', workspaceName: 'Allow Co' }),
    );
    const cookie = signup.cookie;
    const wsId = signup.body.workspace.id;
    const { deviceToken, agents } = await setup(cookie, wsId, ['stat']);
    const sock = connectDaemon(deviceToken);
    await new Promise((r, s) => {
      sock.on('connect', r);
      sock.on('connect_error', s);
    });
    const hd = holdingDaemon(sock);

    const run = await fetchJson(`/api/v1/agents/${agents.stat.id}/test`, json({}, cookie));
    await waitFor(async () => {
      const r = await fetchJson(`/api/v1/runs/${run.body.id}`, { headers: { cookie } });
      return r.body.status === 'dispatched';
    });

    // Rogue daemon tries to forge a terminal status directly.
    hd.raw(D.RUN_EVENT, {
      runId: run.body.id,
      seq: 2,
      type: 'status',
      payload: { status: 'succeeded' },
    });
    await wait(300);
    const after = await fetchJson(`/api/v1/runs/${run.body.id}`, { headers: { cookie } });
    expect(after.body.status).toBe('dispatched'); // ignored — not resurrected as succeeded

    hd.finish(run.body.id);
    sock.disconnect();
  }, 15000);

  it('a second trigger while an agent is running queues; draining happens on finish', async () => {
    const email = `seq-${stamp()}@t.co`;
    await prisma.user.deleteMany({ where: { email } });
    const signup = await fetchJson(
      '/api/v1/auth/signup',
      json({ email, name: 'Owner', password: 'supersecret-1', workspaceName: 'Seq Co' }),
    );
    const cookie = signup.cookie;
    const wsId = signup.body.workspace.id;
    const { deviceToken, agents } = await setup(cookie, wsId, ['worker']);
    const sock = connectDaemon(deviceToken);
    await new Promise((r, s) => {
      sock.on('connect', r);
      sock.on('connect_error', s);
    });
    const hd = holdingDaemon(sock);

    const run1 = await fetchJson(`/api/v1/agents/${agents.worker.id}/test`, json({}, cookie));
    await waitFor(async () => {
      const r = await fetchJson(`/api/v1/runs/${run1.body.id}`, { headers: { cookie } });
      return r.body.status === 'dispatched';
    });

    // Second trigger while run1 is active → run2 must stay queued.
    const run2 = await fetchJson(`/api/v1/agents/${agents.worker.id}/test`, json({}, cookie));
    expect(run2.body.status).toBe('queued');

    // Finishing run1 frees the slot → run2 is drained + dispatched.
    hd.finish(run1.body.id);
    await waitFor(async () => {
      const r = await fetchJson(`/api/v1/runs/${run2.body.id}`, { headers: { cookie } });
      return r.body.status === 'dispatched';
    });
    hd.finish(run2.body.id);
    sock.disconnect();
  }, 20000);
});
