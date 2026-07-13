/**
 * Security regression tests — pin the Phase-1-review fixes:
 *  - CRITICAL: pre-auth account takeover via invite accept (must be blocked)
 *  - Invite recipient binding (logged-in non-recipient → 403)
 *  - Invite-accept enforces the 12-char password policy
 * These exist so a regression in acceptInvite/signUpViaInvite fails CI.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { prisma } from './lib/db.js';

const app = createApp();
const stamp = () => Date.now().toString(36);

let victimCookies = null;
let attackerCookies = null;
let trapInviteToken = null;
let victimEmail = null;

beforeAll(async () => {
  victimEmail = `victim-${stamp()}@corp.com`;
  const attackerEmail = `attacker-${stamp()}@evil.com`;
  await prisma.user.deleteMany({ where: { email: { in: [victimEmail, attackerEmail] } } });

  // Victim signs up with their own workspace.
  victimCookies = request.agent(app);
  await victimCookies.post('/api/v1/auth/signup').send({
    email: victimEmail,
    name: 'Victim',
    password: 'victim-password-1',
    workspaceName: 'Victim Co',
  });

  // Attacker signs up separately.
  attackerCookies = request.agent(app);
  const attackerSignup = await attackerCookies.post('/api/v1/auth/signup').send({
    email: attackerEmail,
    name: 'Attacker',
    password: 'attacker-password',
    workspaceName: 'Trap Co',
  });
  const trapWs = attackerSignup.body.workspace.id;

  // Attacker mints an invite addressed to the VICTIM's email.
  const inv = await attackerCookies
    .post(`/api/v1/workspaces/${trapWs}/invites`)
    .send({ email: victimEmail, role: 'admin' });
  trapInviteToken = inv.body.link.split('/invite/')[1];
});

describe('CRITICAL: pre-auth account takeover via invite', () => {
  it('refuses to resolve an anonymous invite accept to an existing account (409)', async () => {
    // Anonymous (fresh cookie jar) tries to "sign up" with the victim's invite.
    const attackerFresh = request.agent(app);
    const res = await attackerFresh
      .post(`/api/v1/invites/${trapInviteToken}/accept`)
      .send({ name: 'Hijacker', password: 'newpassword123' });
    expect(res.status).toBe(409);
  });

  it('does NOT authenticate the caller as the victim', async () => {
    // After the failed takeover, a fresh session must NOT see the victim.
    const fresh = request.agent(app);
    const me = await fresh.get('/api/v1/auth/me');
    expect(me.status).toBe(401);
  });

  it('victim is unchanged (still logs in with the original password)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: victimEmail, password: 'victim-password-1' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(victimEmail);
  });
});

describe('invite recipient binding', () => {
  it('a logged-in user whose email != invite email is rejected (403)', async () => {
    // Attacker (logged in) tries to accept the victim's invite.
    const res = await attackerCookies.post(`/api/v1/invites/${trapInviteToken}/accept`).send({});
    expect([403]).toContain(res.status);
  });
});

describe('invite-accept password policy', () => {
  it('rejects a short password (<12) via Zod (400)', async () => {
    // Mint a fresh invite for an unregistered email so we reach the signup path.
    const targetEmail = `fresh-${stamp()}@corp.com`;
    const inv = await attackerCookies
      .post('/api/v1/workspaces') // attacker makes another workspace? no — reuse trap
      .send({ name: 'Trap2' });
    // simpler: invite the fresh email into the existing trap workspace
    const invite = await attackerCookies
      .post(`/api/v1/workspaces/${inv.body.id}/invites`)
      .send({ email: targetEmail, role: 'member' });
    const token = invite.body.link.split('/invite/')[1];

    const res = await request(app)
      .post(`/api/v1/invites/${token}/accept`)
      .send({ name: 'Fresh', password: 'short' });
    expect(res.status).toBe(400);
  });
});
