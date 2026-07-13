/**
 * Beta-team seed (PLAN.md §15 — Phase 8 "seed 5–10 beta teams"). Creates N
 * workspaces, each with 2–4 humans, 1–3 agents, a computer, channels, and a
 * week of run history. For load-testing and seeding hand-picked teams.
 *
 * Usage: node prisma/seed-beta.js [count]   (default 5)
 * Idempotent by slug suffix; safe to re-run with a different count.
 */
import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PASSWORD = 'demo-password-123';
const COUNT = Number(process.argv[2] ?? 5);

async function upsertUser(email, name) {
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, passwordHash, emailVerifiedAt: new Date() },
    include: { actor: true },
  });
  let actor = user.actor;
  if (!actor) actor = await prisma.actor.create({ data: { kind: 'user', userId: user.id } });
  return { user, actor };
}

async function seedTeam(i) {
  const slug = `beta-${i + 1}`;
  const ownerEmail = `owner-${slug}@flotilla.beta`;
  const owner = await upsertUser(ownerEmail, `Owner ${slug}`);
  const ws = await prisma.workspace.upsert({
    where: { slug },
    update: {},
    create: { name: `Beta Team ${i + 1}`, slug, ownerId: owner.user.id, plan: 'pro' },
  });
  await prisma.workspaceMember.upsert({
    where: { workspaceId_actorId: { workspaceId: ws.id, actorId: owner.actor.id } },
    update: { role: 'owner' },
    create: { workspaceId: ws.id, actorId: owner.actor.id, role: 'owner' },
  });

  const general = await prisma.channel.upsert({
    where: { workspaceId_name: { workspaceId: ws.id, name: 'general' } },
    update: {},
    create: { workspaceId: ws.id, name: 'general', kind: 'public', createdById: owner.actor.id },
  });
  await prisma.channelMember.upsert({
    where: { channelId_actorId: { channelId: general.id, actorId: owner.actor.id } },
    update: {},
    create: { channelId: general.id, actorId: owner.actor.id },
  });

  // 1–3 agents.
  const agentCount = 1 + (i % 3);
  let computer = await prisma.computer.findFirst({
    where: { workspaceId: ws.id, name: `Computer ${slug}` },
  });
  if (!computer) {
    computer = await prisma.computer.create({
      data: {
        workspaceId: ws.id,
        ownerUserId: owner.user.id,
        name: `Computer ${slug}`,
        platform: 'darwin',
        daemonVersion: '0.0.0',
        status: 'offline',
      },
    });
  }
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  for (let a = 0; a < agentCount; a++) {
    const handle = `agent${a}-${slug}`;
    let agent = await prisma.agent.findUnique({
      where: { workspaceId_handle: { workspaceId: ws.id, handle } },
    });
    if (!agent) {
      agent = await prisma.agent.create({
        data: {
          workspaceId: ws.id,
          name: `Agent ${a}`,
          handle,
          runtime: 'mock',
          computerId: computer.id,
          createdBy: owner.user.id,
        },
      });
      const actor = await prisma.actor.create({ data: { kind: 'agent', agentId: agent.id } });
      await prisma.workspaceMember.create({
        data: { workspaceId: ws.id, actorId: actor.id, role: 'agent' },
      });
    }
    // A week of run history.
    const existing = await prisma.agentRun.count({ where: { agentId: agent.id } });
    if (existing === 0) {
      const runs = [];
      for (let d = 0; d < 7; d++) {
        runs.push({
          workspaceId: ws.id,
          agentId: agent.id,
          computerId: computer.id,
          status: d % 4 === 0 ? 'failed' : 'succeeded',
          model: 'claude-sonnet-5',
          tokensIn: BigInt(1000 + d * 300),
          tokensOut: BigInt(400 + d * 100),
          costEstimateCents: (d + 1) * 3,
          queuedAt: new Date(now - d * day),
          startedAt: new Date(now - d * day),
          finishedAt: new Date(now - d * day + 60_000),
        });
      }
      await prisma.agentRun.createMany({ data: runs });
    }
  }
  return slug;
}

async function main() {
  const slugs = [];
  for (let i = 0; i < COUNT; i++) slugs.push(await seedTeam(i));
  console.log(`🌱 Beta seed complete: ${COUNT} teams`);
  console.log(`   slugs: ${slugs.join(', ')}`);
  console.log(`   login: owner-beta-<n>@flotilla.beta / ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error('Beta seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
