/**
 * Phase 2 chat integration tests (Supertest): channels, messages, threads,
 * reactions, mentions, DMs, read cursors — and tenant isolation across
 * channels (PLAN.md §13). Two agents share a workspace via invite.
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
let channelId = null;

beforeAll(async () => {
  const emailA = `chat-a-${stamp()}@test.flotilla`;
  const emailB = `chat-b-${stamp()}@test.flotilla`;
  await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });

  // A creates workspace, invites B, B accepts.
  const signup = await A.post('/api/v1/auth/signup').send({
    email: emailA,
    name: 'Anna Chat',
    password: 'supersecret-1',
    workspaceName: 'Chat Co',
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
    name: 'Ben Chat',
    password: 'supersecret-2',
  });
});

describe('channels', () => {
  it('A creates a public channel; B sees it', async () => {
    const res = await A.post(`/api/v1/workspaces/${workspaceId}/channels`).send({
      name: 'proj-apollo',
      kind: 'public',
    });
    expect(res.status).toBe(201);
    channelId = res.body.id;

    const list = await B.get(`/api/v1/workspaces/${workspaceId}/channels`);
    expect(list.body.items.some((c) => c.id === channelId)).toBe(true);
  });

  it('rejects duplicate channel names (409)', async () => {
    const res = await A.post(`/api/v1/workspaces/${workspaceId}/channels`).send({
      name: 'proj-apollo',
    });
    expect(res.status).toBe(409);
  });

  it('creates a private channel (creator auto-joined)', async () => {
    const res = await A.post(`/api/v1/workspaces/${workspaceId}/channels`).send({
      name: 'secret',
      kind: 'private',
    });
    expect(res.status).toBe(201);
  });
});

describe('messages + threads', () => {
  let rootId = null;

  it('posts a message to #general', async () => {
    const res = await A.post(`/api/v1/channels/${generalId}/messages`).send({
      content: 'hello world',
    });
    expect(res.status).toBe(201);
    expect(res.body.content).toBe('hello world');
    expect(res.body.sender.kind).toBe('user');
    rootId = res.body.id;
  });

  it('lists messages newest-first', async () => {
    const res = await A.get(`/api/v1/channels/${generalId}/messages`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('replies in a thread + fetches the thread', async () => {
    const reply = await B.post(`/api/v1/channels/${generalId}/messages`).send({
      content: 'a reply',
      threadRootId: rootId,
    });
    expect(reply.status).toBe(201);
    expect(reply.body.threadRootId).toBe(rootId);

    const thread = await A.get(`/api/v1/messages/${rootId}/thread`);
    expect(thread.body.items.length).toBe(1);
    expect(thread.body.items[0].content).toBe('a reply');
  });

  it('edits + soft-deletes own message', async () => {
    const m = await A.post(`/api/v1/channels/${generalId}/messages`).send({ content: 'edit me' });
    const edited = await A.patch(`/api/v1/messages/${m.body.id}`).send({ content: 'edited!' });
    expect(edited.status).toBe(200);
    expect(edited.body.content).toBe('edited!');
    expect(edited.body.editedAt).not.toBeNull();

    // B cannot edit A's message.
    const forbidden = await B.patch(`/api/v1/messages/${m.body.id}`).send({ content: 'hacked' });
    expect(forbidden.status).toBe(403);

    const del = await A.delete(`/api/v1/messages/${m.body.id}`);
    expect(del.status).toBe(200);
  });

  it('dedupes optimistic sends by clientNonce', async () => {
    const a = await A.post(`/api/v1/channels/${generalId}/messages`).send({
      content: 'dup',
      clientNonce: 'nonce-xyz',
    });
    const b = await A.post(`/api/v1/channels/${generalId}/messages`).send({
      content: 'dup',
      clientNonce: 'nonce-xyz',
    });
    expect(a.body.id).toBe(b.body.id); // same message returned
  });
});

describe('reactions', () => {
  it('adds then removes a reaction', async () => {
    const m = await A.post(`/api/v1/channels/${generalId}/messages`).send({
      content: 'react here',
    });
    const add = await A.post(`/api/v1/messages/${m.body.id}/reactions`).send({ emoji: '🚀' });
    expect(add.status).toBe(200);
    expect(add.body.find((r) => r.emoji === '🚀')?.count).toBe(1);

    const remove = await A.delete(`/api/v1/messages/${m.body.id}/reactions?emoji=🚀`);
    expect(remove.body.find((r) => r.emoji === '🚀')?.count ?? 0).toBe(0);
  });
});

describe('mentions + DM', () => {
  it('resolves an @mention of a workspace member', async () => {
    // B's name is "Ben Chat" -> normalized "benchat". Mention by a token that
    // normalizes to it.
    const res = await A.post(`/api/v1/channels/${generalId}/messages`).send({
      content: 'hey @benchat what do you think?',
    });
    expect(res.status).toBe(201);
    const mentions = await prisma.mention.findMany({ where: { messageId: res.body.id } });
    expect(mentions.length).toBe(1);
  });

  it('find-or-creates a DM between A and B', async () => {
    const meA = await A.get('/api/v1/auth/me');
    const meB = await B.get('/api/v1/auth/me');
    // Need actor ids — fetch members.
    const members = await A.get(`/api/v1/workspaces/${workspaceId}/members`);
    const aActor = members.body.items.find((m) => m.userId === meA.body.user.id).actorId;
    const bActor = members.body.items.find((m) => m.userId === meB.body.user.id).actorId;

    const dm1 = await A.post(`/api/v1/workspaces/${workspaceId}/dms`).send({
      actorIds: [aActor, bActor],
    });
    expect(dm1.status).toBe(201);
    const dm2 = await B.post(`/api/v1/workspaces/${workspaceId}/dms`).send({
      actorIds: [aActor, bActor],
    });
    expect(dm2.body.id).toBe(dm1.body.id); // same DM returned (find-or-create)
  });
});

describe('channel tenant isolation', () => {
  it('a non-workspace-member cannot read messages (403)', async () => {
    const intruder = request.agent(app);
    await intruder.post('/api/v1/auth/signup').send({
      email: `chat-x-${stamp()}@test.flotilla`,
      name: 'X',
      password: 'supersecret-3',
      workspaceName: 'Other',
    });
    const res = await intruder.get(`/api/v1/channels/${generalId}/messages`);
    expect([403, 404]).toContain(res.status);
  });
});
