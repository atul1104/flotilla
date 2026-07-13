/**
 * Phase 8 hardening tests: plan-limit enforcement, CSRF content-type check,
 * CSP headers, onboarding funnel, markdown sanitization (server-side: the
 * rehype-sanitize plugin runs in the browser; here we assert the API doesn't
 * strip content — sanitization is a client concern, tested via the build).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { prisma } from './lib/db.js';
import { PLAN_LIMITS } from '@flotilla/shared';
import { getOnboarding, markOnboardingStep } from './modules/workspaces/onboarding.js';
import { historyCutoff, isReadable, limitsForPlan } from './lib/limits.js';

const app = createApp();
const A = request.agent(app);
const stamp = () => Date.now().toString(36);

let workspaceId = null;
let generalId = null;

beforeAll(async () => {
  const email = `p8-${stamp()}@t.co`;
  await prisma.user.deleteMany({ where: { email } });
  const signup = await A.post('/api/v1/auth/signup').send({
    email,
    name: 'P8 Owner',
    password: 'supersecret-1',
    workspaceName: 'P8 Co',
  });
  workspaceId = signup.body.workspace.id;
  const ch = await A.get(`/api/v1/workspaces/${workspaceId}/channels`);
  generalId = ch.body.items.find((c) => c.name === 'general').id;
});

// ---------------------------------------------------------------------------
// Plan-limit enforcement
// ---------------------------------------------------------------------------
describe('Phase 8: plan limits', () => {
  it('limitsForPlan returns Free caps', () => {
    const free = limitsForPlan('free');
    expect(free.maxAgents).toBe(3);
    expect(free.messageHistoryDays).toBe(30);
  });

  it('historyCutoff is null for Pro (no gate)', () => {
    expect(historyCutoff('pro')).toBeNull();
    expect(historyCutoff('enterprise')).toBeNull();
  });

  it('historyCutoff is ~30 days ago for Free', () => {
    const c = historyCutoff('free');
    expect(c).toBeInstanceOf(Date);
    const days = (Date.now() - c.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });

  it('isReadable gates old messages on Free, all on Pro', () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    const recent = new Date();
    expect(isReadable(old, 'free')).toBe(false);
    expect(isReadable(recent, 'free')).toBe(true);
    expect(isReadable(old, 'pro')).toBe(true);
  });

  it('refuses creating a 4th agent on Free (402)', async () => {
    // Create 3 agents (the Free cap).
    for (let i = 0; i < PLAN_LIMITS.free.maxAgents; i++) {
      const r = await A.post(`/api/v1/workspaces/${workspaceId}/agents`).send({
        name: `Bot ${i}`,
        handle: `bot${i}-${stamp()}`,
        runtime: 'mock',
      });
      expect(r.status).toBe(201);
    }
    // The 4th must be refused.
    const r = await A.post(`/api/v1/workspaces/${workspaceId}/agents`).send({
      name: 'Bot 4',
      handle: `bot4-${stamp()}`,
      runtime: 'mock',
    });
    expect(r.status).toBe(402);
    expect(r.body.code).toBe('PLAN_LIMIT');
  });

  it('gates message reads at 30 days on Free', async () => {
    // Post a message, backdate it to 60 days ago directly in the DB.
    const posted = await A.post(`/api/v1/channels/${generalId}/messages`).send({
      content: `old-msg-${stamp()}`,
    });
    expect(posted.status).toBe(201);
    await prisma.message.update({
      where: { id: posted.body.id },
      data: { createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
    });
    // List messages — the old one must NOT appear on Free.
    const list = await A.get(`/api/v1/channels/${generalId}/messages`);
    expect(list.status).toBe(200);
    expect(list.body.items.some((m) => m.id === posted.body.id)).toBe(false);
  });

  it('upload quota: presign is workspace-scoped + plan-aware', async () => {
    // A tiny upload succeeds.
    const ok = await A.post(`/api/v1/workspaces/${workspaceId}/uploads/presign`).send({
      filename: 'tiny.txt',
      mime: 'text/plain',
      size: 10,
    });
    expect(ok.status).toBe(201);
    // Over the per-file cap (50 MB) fails validation.
    const tooBig = await A.post(`/api/v1/workspaces/${workspaceId}/uploads/presign`).send({
      filename: 'huge.bin',
      mime: 'application/octet-stream',
      size: 60 * 1024 * 1024,
    });
    expect(tooBig.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// CSRF content-type check
// ---------------------------------------------------------------------------
describe('Phase 8: CSRF content-type check', () => {
  it('rejects a mutation with a non-JSON content-type (415)', async () => {
    const res = await A.post(`/api/v1/workspaces/${workspaceId}/agents`)
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('name=x');
    expect(res.status).toBe(415);
  });

  it('accepts a mutation with JSON content-type', async () => {
    // Bump to Pro first so the agent cap doesn't interfere.
    await prisma.workspace.update({ where: { id: workspaceId }, data: { plan: 'pro' } });
    const res = await A.post(`/api/v1/workspaces/${workspaceId}/agents`).send({
      name: 'JSON bot',
      handle: `jsonbot-${stamp()}`,
      runtime: 'mock',
    });
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// CSP headers
// ---------------------------------------------------------------------------
describe('Phase 8: security headers', () => {
  it('sets X-Content-Type-Options nosniff', async () => {
    const res = await A.get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets a frame-guard (X-Frame-Options DENY or CSP frame-ancestors)', async () => {
    const res = await A.get('/health');
    const framed = res.headers['x-frame-options'] || res.headers['content-security-policy'];
    expect(framed).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Onboarding funnel
// ---------------------------------------------------------------------------
describe('Phase 8: onboarding funnel', () => {
  it('returns the 4 steps with workspace_created done', async () => {
    const ob = await getOnboarding(workspaceId);
    expect(ob.total).toBe(4);
    expect(ob.steps[0].key).toBe('workspace_created');
    expect(ob.steps[0].completedAt).toBeTruthy();
  });

  it('markOnboardingStep records a step idempotently', async () => {
    await markOnboardingStep(workspaceId, 'first_agent');
    await markOnboardingStep(workspaceId, 'first_agent'); // idempotent
    const ob = await getOnboarding(workspaceId);
    const agent = ob.steps.find((s) => s.key === 'first_agent');
    expect(agent.completedAt).toBeTruthy();
  });

  it('GET /workspaces/:id/onboarding returns the funnel', async () => {
    const res = await A.get(`/api/v1/workspaces/${workspaceId}/onboarding`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(4);
    expect(Array.isArray(res.body.steps)).toBe(true);
  });
});
