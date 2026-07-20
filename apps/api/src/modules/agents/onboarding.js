/**
 * Agent onboarding (PLAN.md §8.4 improvement). When a new agent is created, an
 * `@onboarder` agent greets it in a dedicated `#onboarding` channel with the
 * workspace context + sibling-agent roster, and the new agent runs to orient
 * itself and reply. This reuses the mention→run→reply pipeline.
 *
 * Design choices (confirmed with owner):
 *  - Design A: onboard by @mention in chat (visible, conversational).
 *  - Dedicated #onboarding channel (keeps #general clean).
 *  - @onboarder is auto-created if missing, with a default system prompt holding
 *    workspace context. Edit its system prompt in the Agents page to customize.
 */
import { prisma } from '../../lib/db.js';
import {
  ACTOR_KIND,
  WORKSPACE_ROLE,
  CHANNEL_KIND,
  DEFAULTS,
  DEFAULT_APPROVAL_POLICY,
  RUN_TRIGGER,
} from '@atul1104/shared';
import { createChannel } from '../channels/service.js';
import { createMessage } from '../messages/service.js';
import { triggerRun } from '../runs/service.js';
import { getRealtime } from '../../realtime/index.js';

const ONBOARDER_HANDLE = 'onboarder';
const ONBOARDING_CHANNEL = 'onboarding';

const DEFAULT_ONBOARDER_PROMPT = `You are the workspace onboarding agent. When a new agent is @mentioned to you in #onboarding, greet them, give them context about the workspace and their teammates, and ask them to introduce themselves and read their AGENT.md. Keep it warm and concise.`;

/** Ensure @onboarder exists in the workspace; return its agent row. */
async function ensureOnboarder(workspaceId, createdBy, computerId) {
  const existing = await prisma.agent.findUnique({
    where: { workspaceId_handle: { workspaceId, handle: ONBOARDER_HANDLE } },
    include: { actor: true },
  });
  if (existing) return existing;

  const agent = await prisma.agent.create({
    data: {
      workspaceId,
      name: 'Onboarder',
      handle: ONBOARDER_HANDLE,
      tagline: 'Onboards new agents with workspace context',
      systemPrompt: DEFAULT_ONBOARDER_PROMPT,
      runtime: DEFAULTS.AGENT_RUNTIME,
      model: DEFAULTS.AGENT_MODEL,
      computerId,
      approvalPolicy: { ...DEFAULT_APPROVAL_POLICY },
      createdBy,
    },
  });
  const actor = await prisma.actor.create({ data: { kind: ACTOR_KIND.AGENT, agentId: agent.id } });
  await prisma.agent.update({ where: { id: agent.id }, data: { actorId: actor.id } });
  await prisma.workspaceMember.create({
    data: { workspaceId, actorId: actor.id, role: WORKSPACE_ROLE.AGENT },
  });
  return prisma.agent.findUnique({ where: { id: agent.id }, include: { actor: true } });
}

/** Ensure the #onboarding public channel exists; return its id. */
async function ensureOnboardingChannel(workspaceId, creatorActorId) {
  const existing = await prisma.channel.findUnique({
    where: { workspaceId_name: { workspaceId, name: ONBOARDING_CHANNEL } },
  });
  if (existing) return existing.id;
  const ch = await createChannel({
    workspaceId,
    name: ONBOARDING_CHANNEL,
    kind: CHANNEL_KIND.PUBLIC,
    topic: 'Agent onboarding',
    createdById: creatorActorId,
  });
  return ch.id;
}

/** Build the roster of sibling agents (excluding onboarder + the new agent). */
async function siblingRoster(workspaceId, excludeAgentId) {
  const agents = await prisma.agent.findMany({
    where: { workspaceId, id: { not: excludeAgentId }, handle: { not: ONBOARDER_HANDLE } },
    orderBy: { createdAt: 'asc' },
  });
  if (!agents.length) return 'none yet — you are the first working agent.';
  return agents.map((a) => `- @${a.handle} (${a.name})${a.tagline ? ` — ${a.tagline}` : ''}`).join('\n');
}

/**
 * Run onboarding for a freshly-created agent. Fire-and-forget; never throws into
 * the caller (createAgent) — onboarding is best-effort and must not fail agent
 * creation.
 */
export async function onboardNewAgent(workspaceId, newAgentId) {
  const newAgent = await prisma.agent.findUnique({
    where: { id: newAgentId },
    include: { actor: true },
  });
  if (!newAgent?.actor) return;
  // Don't onboard the onboarder itself (self-trigger guard + avoids a loop).
  if (newAgent.handle === ONBOARDER_HANDLE) return;

  const onboarder = await ensureOnboarder(workspaceId, newAgent.createdBy, newAgent.computerId);
  const channelId = await ensureOnboardingChannel(workspaceId, onboarder.actorId);

  // Post the greeting as @onboarder, @mentioning the new agent so the mention
  // resolver picks it up and triggers the new agent's run.
  const roster = await siblingRoster(workspaceId, newAgentId);
  const content =
    `@${newAgent.handle} welcome to the workspace! You're new here.\n\n` +
    `Your teammates (other agents):\n${roster}\n\n` +
    `Please introduce yourself, describe what you do, and read your AGENT.md for standing instructions.`;

  const { message } = await createMessage({
    channelId,
    senderId: onboarder.actorId,
    content,
  });
  getRealtime()?.broadcastMessage(workspaceId, channelId, message, [newAgent.actorId]);

  // Trigger the new agent's run so it orients + replies in #onboarding.
  await triggerRun({
    workspaceId,
    agentId: newAgent.id,
    triggerMessageId: message.id,
    contextText: content,
    trigger: RUN_TRIGGER.MENTION,
  }).catch(() => {});
}
