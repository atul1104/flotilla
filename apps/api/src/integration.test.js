/**
 * Phase 1 integration tests (Supertest): auth, workspaces, invites, and the
 * critical TENANT-ISOLATION suite — user A must never read workspace B
 * (PLAN.md §13, #1 bug class). Uses request.agent to persist session cookies.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import * as authService from './modules/auth/service.js';
import { prisma } from './lib/db.js';

const app = createApp();
const agentA = request.agent(app);
const agentB = request.agent(app);

const stamp = () => Date.now().toString(36);
let workspaceA = null;
let inviteToken = null;

const A = {
  email: `a-${stamp()}@test.flotilla`,
  name: 'Alice T',
  password: 'supersecret-pw-1',
  ws: 'Acme Alpha',
};
const B = { email: `b-${stamp()}@test.flotilla`, name: 'Bob T', password: 'supersecret-pw-2' };

beforeAll(async () => {
  // clean any prior test users with these emails (safety on shared dev db)
  await prisma.user.deleteMany({ where: { email: { in: [A.email, B.email] } } });
});

describe('auth flow', () => {
  it('signs up and creates a workspace', async () => {
    const res = await agentA.post('/api/v1/auth/signup').send({
      email: A.email,
      name: A.name,
      password: A.password,
      workspaceName: A.ws,
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(A.email);
    expect(res.body.workspace).toBeTruthy();
    workspaceA = res.body.workspace;
  });

  it('returns the session via /me', async () => {
    const res = await agentA.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBeTruthy();
    expect(res.body.workspaces.length).toBe(1);
    expect(res.body.workspaces[0].slug).toBe(workspaceA.slug);
  });

  it('rejects a duplicate signup (409)', async () => {
    const res = await agentA.post('/api/v1/auth/signup').send({
      email: A.email,
      name: A.name,
      password: A.password,
    });
    expect(res.status).toBe(409);
  });

  it('rejects bad login creds (401)', async () => {
    const res = await agentA
      .post('/api/v1/auth/login')
      .send({ email: A.email, password: 'wrong-pw' });
    expect(res.status).toBe(401);
  });

  it('logs out then back in', async () => {
    expect((await agentA.post('/api/v1/auth/logout')).status).toBe(200);
    expect((await agentA.get('/api/v1/auth/me')).status).toBe(401);
    const res = await agentA
      .post('/api/v1/auth/login')
      .send({ email: A.email, password: A.password });
    expect(res.status).toBe(200);
  });

  it('verifies email via token', async () => {
    const me = await agentA.get('/api/v1/auth/me');
    expect(me.body.user.emailVerifiedAt).toBeNull();
    const token = await authService.startEmailVerification(me.body.user.id, A.email, A.name);
    const res = await agentA.post('/api/v1/auth/verify-email').send({ token });
    expect(res.status).toBe(200);
    const after = await agentA.get('/api/v1/auth/me');
    expect(after.body.user.emailVerifiedAt).not.toBeNull();
  });
});

describe('workspace + invite flow', () => {
  it('lists members (owner present)', async () => {
    const res = await agentA.get(`/api/v1/workspaces/${workspaceA.id}/members`);
    expect(res.status).toBe(200);
    expect(res.body.items.find((m) => m.role === 'owner')).toBeTruthy();
  });

  it('creates an invite', async () => {
    const res = await agentA
      .post(`/api/v1/workspaces/${workspaceA.id}/invites`)
      .send({ email: B.email, role: 'member' });
    expect(res.status).toBe(201);
    expect(res.body.link).toMatch(/\/invite\//);
    inviteToken = res.body.link.split('/invite/')[1];
  });

  it('previews an invite', async () => {
    const res = await request(app).get(`/api/v1/invites/${inviteToken}`);
    expect(res.status).toBe(200);
    expect(res.body.workspaceName).toBe(A.ws);
  });

  it('accepts the invite as a new user (Bob)', async () => {
    const res = await agentB.post(`/api/v1/invites/${inviteToken}/accept`).send({
      name: B.name,
      password: B.password,
    });
    expect(res.status).toBe(201);
    expect(res.body.workspaceId).toBe(workspaceA.id);
  });

  it('now lists Bob as a member', async () => {
    const res = await agentA.get(`/api/v1/workspaces/${workspaceA.id}/members`);
    expect(res.body.items.length).toBe(2);
    expect(res.body.items.some((m) => m.email === B.email)).toBe(true);
  });
});

describe('tenant isolation (critical)', () => {
  it('denies a non-member access to the workspace (403)', async () => {
    // Bob is logged in (agentB) but has no workspace of his own; he IS a member
    // of A's workspace though. So create a fresh user C with its own ws and
    // confirm C cannot read A's workspace.
    const cEmail = `c-${stamp()}@test.flotilla`;
    const agentC = request.agent(app);
    await agentC.post('/api/v1/auth/signup').send({
      email: cEmail,
      name: 'Carol T',
      password: 'supersecret-pw-3',
      workspaceName: 'Carol Co',
    });
    const res = await agentC.get(`/api/v1/workspaces/${workspaceA.id}`);
    expect(res.status).toBe(403);
  });

  it('denies a non-member access to members list (403)', async () => {
    const cEmail = `d-${stamp()}@test.flotilla`;
    const agentD = request.agent(app);
    await agentD.post('/api/v1/auth/signup').send({
      email: cEmail,
      name: 'Dan T',
      password: 'supersecret-pw-4',
      workspaceName: 'Dan Co',
    });
    const res = await agentD.get(`/api/v1/workspaces/${workspaceA.id}/members`);
    expect(res.status).toBe(403);
  });

  it('requires auth for protected routes (401)', async () => {
    const res = await request(app).get('/api/v1/workspaces');
    expect(res.status).toBe(401);
  });
});
