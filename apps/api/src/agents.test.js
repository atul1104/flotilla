/**
 * Phase 4 E2E (the 🎉 demo): a fake daemon client pairs, connects, receives a
 * run.dispatch (triggered via POST /agents/:id/test), streams a reply, and the
 * agent's message lands in the channel with the run marked succeeded.
 * (PLAN.md §8.5, §13 "fake daemon client".)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { io } from 'socket.io-client';
import { createApp } from './app.js';
import { initRealtime } from './realtime/index.js';
import { DAEMON_SOCKET_EVENTS as D } from '@flotila-org/shared';
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

describe('agent run end-to-end (paired daemon)', () => {
  it('dispatches a run, the daemon streams a reply, and the run succeeds', async () => {
    const email = `agent-${stamp()}@t.co`;
    await prisma.user.deleteMany({ where: { email } });

    // 1) signup + workspace + #general
    const signup = await fetchJson('/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        name: 'Owner',
        password: 'supersecret-1',
        workspaceName: 'Agent Co',
      }),
    });
    const cookie = signup.cookie;
    const wsId = signup.body.workspace.id;
    const ch = await fetchJson(`/api/v1/workspaces/${wsId}/channels`, { headers: { cookie } });
    const general = ch.body.items.find((c) => c.name === 'general').id;

    // 2) pairing code → pair → device token
    const codeRes = await fetchJson(`/api/v1/workspaces/${wsId}/computers/pairing-code`, {
      method: 'POST',
      headers: { cookie },
    });
    const pairRes = await fetchJson('/api/v1/daemon/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: codeRes.body.code, name: 'test-laptop', platform: 'darwin' }),
    });
    expect(pairRes.status).toBe(201);
    const { computerId, deviceToken } = pairRes.body;

    // 3) create agent + bind to the (soon-online) computer
    const agentRes = await fetchJson(`/api/v1/workspaces/${wsId}/agents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        name: 'Researcher',
        handle: 'researcher',
        runtime: 'claude-code',
        tagline: 'summarizes things',
      }),
    });
    expect(agentRes.status).toBe(201);
    const agent = agentRes.body;
    await fetchJson(`/api/v1/agents/${agent.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ computerId }),
    });

    // 4) fake daemon connects with the device token
    const daemon = io(`${BASE()}/daemon`, {
      transports: ['polling'],
      auth: { token: deviceToken, platform: 'darwin', daemonVersion: 'test' },
    });
    await new Promise((resolve, fail) => {
      daemon.on('connect', resolve);
      daemon.on('connect_error', fail);
    });

    // 5) daemon handles run.dispatch by streaming a reply
    const dispatched = new Promise((resolve) => daemon.on(D.RUN_DISPATCH, resolve));
    daemon.on(D.RUN_DISPATCH, (ctx) => {
      const { runId } = ctx;
      // stream a thinking event + a message + finish
      daemon.emit(D.RUN_EVENT, { runId, seq: 1, type: 'thinking', payload: { text: 'pondering' } });
      daemon.emit(D.RUN_MESSAGE, {
        runId,
        content: `**mock reply** to: "${String(ctx.context?.trigger || '').slice(0, 40)}"`,
      });
      setTimeout(
        () =>
          daemon.emit(D.RUN_FINISHED, {
            runId,
            status: 'succeeded',
            usage: { tokensIn: 10, tokensOut: 20 },
          }),
        100,
      );
    });

    // 6) owner triggers a run
    const testRes = await fetchJson(`/api/v1/agents/${agent.id}/test`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(testRes.status).toBe(201);
    const runId = testRes.body.id;

    await dispatched;

    // 7) the agent's reply lands in the channel + the run succeeds
    await new Promise((r) => setTimeout(r, 600));
    const messages = await fetchJson(`/api/v1/channels/${general}/messages`, {
      headers: { cookie },
    });
    const reply = messages.body.items.find(
      (m) => m.sender?.kind === 'agent' && m.content.includes('mock reply'),
    );
    expect(reply).toBeTruthy();

    const run = await fetchJson(`/api/v1/runs/${runId}`, { headers: { cookie } });
    expect(run.body.status).toBe('succeeded');
    expect(run.body.tokensOut).toBe(20);

    daemon.disconnect();
  }, 20000);

  it('rejects a daemon socket with a bad token', async () => {
    const bad = io(`${BASE()}/daemon`, {
      transports: ['polling'],
      auth: { token: 'not-a-real-token' },
    });
    const err = await new Promise((resolve) => bad.on('connect_error', resolve));
    expect(String(err)).toMatch(/unauthorized|jwt|token/i);
    bad.disconnect();
  }, 10000);
});
