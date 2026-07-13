/**
 * Seed: demo workspace + 2 users + #general channel + a few messages.
 * Idempotent: safe to re-run. Agent + run-history seeding lands in Phase 4.
 *
 * Run: `npm run db:seed` (workspace root) — uses prisma seed config.
 */
import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'demo-password-123'; // >= 12 chars (PLAN.md §11)

async function upsertUser({ email, name }) {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, passwordHash, emailVerifiedAt: new Date() },
    include: { actor: true },
  });

  let actor = user.actor;
  if (!actor) {
    actor = await prisma.actor.create({ data: { kind: 'user', userId: user.id } });
  }
  return { user, actor };
}

async function main() {
  const alice = await upsertUser({ email: 'alice@flotilla.demo', name: 'Alice (Owner)' });
  const bob = await upsertUser({ email: 'bob@flotilla.demo', name: 'Bob (Member)' });

  const workspace = await prisma.workspace.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Flotilla Demo',
      slug: 'demo',
      ownerId: alice.user.id,
      plan: 'free',
      settings: { seededAt: true },
    },
  });

  await prisma.workspaceMember.upsert({
    where: { workspaceId_actorId: { workspaceId: workspace.id, actorId: alice.actor.id } },
    update: { role: 'owner' },
    create: { workspaceId: workspace.id, actorId: alice.actor.id, role: 'owner' },
  });
  await prisma.workspaceMember.upsert({
    where: { workspaceId_actorId: { workspaceId: workspace.id, actorId: bob.actor.id } },
    update: {},
    create: { workspaceId: workspace.id, actorId: bob.actor.id, role: 'member' },
  });

  const general = await prisma.channel.upsert({
    where: { workspaceId_name: { workspaceId: workspace.id, name: 'general' } },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: 'general',
      topic: 'Welcome to Flotilla 👋',
      kind: 'public',
      createdById: alice.actor.id,
    },
  });

  for (const a of [alice.actor, bob.actor]) {
    await prisma.channelMember.upsert({
      where: { channelId_actorId: { channelId: general.id, actorId: a.id } },
      update: {},
      create: { channelId: general.id, actorId: a.id },
    });
  }

  await prisma.message.createMany({
    data: [
      {
        channelId: general.id,
        senderId: alice.actor.id,
        content: 'Welcome to the **Flotilla** demo workspace! 🚀',
      },
      {
        channelId: general.id,
        senderId: bob.actor.id,
        content: 'Phase 0 foundations are live — chat, here we come.',
      },
    ],
    skipDuplicates: true,
  });

  // --- Phase 6: an agent + a computer + run history so the Usage dashboard,
  //     Activity feed, and Agents page are non-empty in the demo. Idempotent. ---
  let computer = await prisma.computer.findFirst({
    where: { workspaceId: workspace.id, name: 'Alice’s laptop' },
  });
  if (!computer) {
    computer = await prisma.computer.create({
      data: {
        workspaceId: workspace.id,
        ownerUserId: alice.user.id,
        name: 'Alice’s laptop',
        platform: 'darwin',
        daemonVersion: '0.0.0',
        status: 'offline',
      },
    });
  }

  let agent = await prisma.agent.findUnique({
    where: { workspaceId_handle: { workspaceId: workspace.id, handle: 'researcher' } },
  });
  if (!agent) {
    agent = await prisma.agent.create({
      data: {
        workspaceId: workspace.id,
        name: 'Researcher',
        handle: 'researcher',
        tagline: 'Investigates, summarizes, cites sources',
        systemPrompt: 'You are a meticulous research agent.',
        runtime: 'mock',
        computerId: computer.id,
        createdBy: alice.user.id,
      },
    });
    const agentActor = await prisma.actor.create({
      data: { kind: 'agent', agentId: agent.id },
    });
    await prisma.workspaceMember.create({
      data: { workspaceId: workspace.id, actorId: agentActor.id, role: 'agent' },
    });
    await prisma.channelMember.create({
      data: { channelId: general.id, actorId: agentActor.id },
    });
  }

  // A few runs spread over the last week so the Usage charts have data.
  const existingRuns = await prisma.agentRun.count({ where: { agentId: agent.id } });
  if (existingRuns === 0) {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const runs = [];
    for (let i = 0; i < 7; i++) {
      const queuedAt = new Date(now - i * day);
      runs.push({
        workspaceId: workspace.id,
        agentId: agent.id,
        computerId: computer.id,
        status: i === 0 ? 'running' : i % 3 === 0 ? 'failed' : 'succeeded',
        model: 'claude-sonnet-5',
        tokensIn: BigInt(2000 + i * 500),
        tokensOut: BigInt(800 + i * 200),
        costEstimateCents: (i + 1) * 5,
        error: i % 3 === 0 ? 'mock failure' : null,
        queuedAt,
        startedAt: queuedAt,
        finishedAt: i === 0 ? null : new Date(now - i * day + 60_000),
      });
    }
    await prisma.agentRun.createMany({ data: runs });
  }

  console.log('🌱 Seed complete');
  console.log(`   workspace: ${workspace.slug} (${workspace.id})`);
  console.log(`   login:     alice@flotilla.demo / ${DEMO_PASSWORD}`);
  console.log(`   login:     bob@flotilla.demo   / ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
