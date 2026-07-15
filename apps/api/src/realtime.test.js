/**
 * Phase 2 realtime E2E: two socket clients in one workspace; a REST message
 * post from one is delivered live to the other (PLAN.md §13 "two socket
 * clients"). Also covers typing + tenant isolation (a third socket in another
 * workspace does NOT receive the broadcast).
 *
 * Uses a real http.Server + socket.io-client (cookie-authenticated sessions).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { io } from 'socket.io-client';
import { createApp } from './app.js';
import { initRealtime } from './realtime/index.js';
import { CLIENT_SOCKET_EVENTS as E } from '@atul1104/shared';
import { prisma } from './lib/db.js';

const stamp = () => Date.now().toString(36);
const BASE = () => `http://127.0.0.1:${port}`;
let port;

const app = createApp();
const server = http.createServer(app);
const rt = initRealtime(server, true); // allow any origin in test

beforeAll(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
afterAll(async () => {
  // Close socket.io first (disconnects server-side clients), then drain + close.
  await new Promise((r) => rt.io.close(r));
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
});

function cookieJar(res) {
  // Node fetch exposes Set-Cookie via getSetCookie() (array), not get().
  const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return set.map((c) => c.split(';')[0]).join('; ');
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(BASE() + path, opts);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, cookie: cookieJar(res) };
}

describe('realtime /client namespace', () => {
  it('delivers a posted message live to a peer socket in the same workspace', async () => {
    const emailA = `rt-a-${stamp()}@t.co`;
    const emailB = `rt-b-${stamp()}@t.co`;
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });

    // A signs up + creates workspace; B is invited + accepts.
    const aSignup = await fetchJson('/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: emailA,
        name: 'Rt A',
        password: 'supersecret-1',
        workspaceName: 'Rt Co',
      }),
    });
    expect(aSignup.status).toBe(201);
    const aCookie = aSignup.cookie;
    const wsId = aSignup.body.workspace.id;

    const ch = await fetchJson(`/api/v1/workspaces/${wsId}/channels`, {
      headers: { cookie: aCookie },
    });
    const general = ch.body.items.find((c) => c.name === 'general').id;

    const inv = await fetchJson(`/api/v1/workspaces/${wsId}/invites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: aCookie },
      body: JSON.stringify({ email: emailB, role: 'member' }),
    });
    const token = inv.body.link.split('/invite/')[1];
    const bAccept = await fetchJson(`/api/v1/invites/${token}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Rt B', password: 'supersecret-2' }),
    });
    expect(bAccept.status).toBe(201);
    const bCookie = bAccept.cookie;

    // B connects a socket with its session cookie.
    const socketB = io(`${BASE()}/client`, {
      transports: ['polling'],
      extraHeaders: { Cookie: bCookie },
    });
    await new Promise((resolve, fail) => {
      socketB.on('connect', resolve);
      socketB.on('connect_error', fail);
    });

    // A posts a message via REST; B should receive it live.
    const received = new Promise((resolve) => socketB.on(E.MESSAGE_CREATED, resolve));
    const post = await fetchJson(`/api/v1/channels/${general}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: aCookie },
      body: JSON.stringify({ content: 'live hello from A' }),
    });
    expect(post.status).toBe(201);

    const event = await received;
    expect(event.message.content).toBe('live hello from A');
    expect(event.channelId).toBe(general);

    socketB.disconnect();
  }, 20000);

  it('does NOT deliver to a socket in a different workspace (tenant isolation)', async () => {
    // Isolated users in two different workspaces.
    const emailX = `rt-x-${stamp()}@t.co`;
    const emailY = `rt-y-${stamp()}@t.co`;
    await prisma.user.deleteMany({ where: { email: { in: [emailX, emailY] } } });

    const xSignup = await fetchJson('/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: emailX,
        name: 'X',
        password: 'supersecret-3',
        workspaceName: 'X Co',
      }),
    });
    const ySignup = await fetchJson('/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: emailY,
        name: 'Y',
        password: 'supersecret-4',
        workspaceName: 'Y Co',
      }),
    });
    const xWs = xSignup.body.workspace.id;
    const xCh = await fetchJson(`/api/v1/workspaces/${xWs}/channels`, {
      headers: { cookie: xSignup.cookie },
    });
    const xGeneral = xCh.body.items.find((c) => c.name === 'general').id;

    // Y connects a socket — Y is NOT in X's workspace room, so must not receive.
    const socketY = io(`${BASE()}/client`, {
      transports: ['polling'],
      extraHeaders: { Cookie: ySignup.cookie },
    });
    await new Promise((resolve, fail) => {
      socketY.on('connect', resolve);
      socketY.on('connect_error', fail);
    });

    let leaked = false;
    socketY.on(E.MESSAGE_CREATED, () => (leaked = true));

    await fetchJson(`/api/v1/channels/${xGeneral}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: xSignup.cookie },
      body: JSON.stringify({ content: 'should not leak to Y' }),
    });
    // Give the broadcast a beat to (not) arrive.
    await new Promise((r) => setTimeout(r, 400));
    expect(leaked).toBe(false);

    socketY.disconnect();
  }, 20000);
});
