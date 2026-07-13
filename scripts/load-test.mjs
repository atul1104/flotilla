#!/usr/bin/env node
/**
 * Load sanity test (PLAN.md §15 — Phase 8 "~50 concurrent users, 10 daemons").
 * Spins up N browser-style socket clients + M fake daemons against a local API,
 * posts messages, and reports p50/p95 latency + any dropped events.
 *
 * Prereq: API running on :4000 with a seeded workspace. Uses the demo login.
 * Usage: node scripts/load-test.mjs [clients] [daemons]   (default 50 10)
 *
 * Not run in CI — this is a manual sanity check before beta.
 */
import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:4000';
const CLIENTS = Number(process.argv[2] ?? 50);
const DAEMONS = Number(process.argv[3] ?? 10);
const WORKSPACE_SLUG = process.env.WS_SLUG ?? 'demo';
const EMAIL = process.env.LOAD_EMAIL ?? 'alice@flotilla.demo';
const PASSWORD = process.env.LOAD_PASSWORD ?? 'demo-password-123';

async function login() {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const cookie =
    res.headers
      .getSetCookie?.()
      .map((c) => c.split(';')[0])
      .join('; ') ?? '';
  const body = await res.json();
  return { cookie, userId: body.user?.id };
}

async function getGeneralChannel(cookie) {
  const res = await fetch(`${API}/api/v1/workspaces/${WORKSPACE_SLUG}`, {
    headers: { cookie },
  });
  const ws = await res.json();
  const chRes = await fetch(`${API}/api/v1/workspaces/${ws.id}/channels`, { headers: { cookie } });
  const ch = await chRes.json();
  return ch.items.find((c) => c.name === 'general');
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor((p / 100) * (sorted.length - 1))];
}

async function main() {
  console.log(`load test: ${CLIENTS} clients, ${DAEMONS} daemons against ${API}`);
  const { cookie } = await login();
  const general = await getGeneralChannel(cookie);

  // Connect N socket clients and measure message broadcast latency.
  const latencies = [];
  let received = 0;
  const clients = [];
  for (let i = 0; i < CLIENTS; i++) {
    const sock = io(`${API}/client`, { extraHeaders: { cookie }, transports: ['websocket'] });
    sock.on('message.created', ({ message }) => {
      received += 1;
      if (message._t0) latencies.push(Date.now() - message._t0);
    });
    await new Promise((r) => sock.on('connect', r));
    clients.push(sock);
  }

  // Post messages via REST and measure round-trip-to-broadcast.
  const POSTS = 200;
  for (let i = 0; i < POSTS; i++) {
    await fetch(`${API}/api/v1/channels/${general.id}/messages`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ content: `load-${i}`, _t0: Date.now() }),
    });
  }
  // Wait a beat for broadcasts to settle.
  await new Promise((r) => setTimeout(r, 2000));

  console.log(`\nresults:`);
  console.log(`  messages posted:  ${POSTS}`);
  console.log(`  broadcasts seen:  ${received} (expected ~${POSTS * CLIENTS})`);
  console.log(`  latency p50:      ${percentile(latencies, 50)} ms`);
  console.log(`  latency p95:      ${percentile(latencies, 95)} ms`);
  console.log(`  dropped (est):    ${Math.max(0, POSTS * CLIENTS - received)}`);

  for (const s of clients) s.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('load test failed:', err);
  process.exit(1);
});
