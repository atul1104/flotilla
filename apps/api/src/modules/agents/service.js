/**
 * Agent business logic (PLAN.md §6, §7.1, §8). An agent is an Actor (kind=agent)
 * + a workspace member (role=agent) so it can be @mentioned and post messages.
 */
import { prisma } from '../../lib/db.js';
import { ConflictError, NotFoundError, ValidationError } from '@atul1104/shared';
import { WORKSPACE_ROLE, ACTOR_KIND, DEFAULTS, DEFAULT_APPROVAL_POLICY } from '@atul1104/shared';
import { assertAgentCap } from '../../lib/limits.js';
import { markOnboardingStep } from '../workspaces/onboarding.js';

export function serializeAgent(a) {
  return {
    id: a.id,
    workspaceId: a.workspaceId,
    actorId: a.actorId,
    name: a.name,
    handle: a.handle,
    avatarUrl: a.avatarUrl,
    tagline: a.tagline,
    systemPrompt: a.systemPrompt,
    runtime: a.runtime,
    model: a.model,
    computerId: a.computerId,
    approvalPolicy: { ...DEFAULT_APPROVAL_POLICY, ...(a.approvalPolicy ?? {}) },
    status: a.status,
    createdAt: a.createdAt,
  };
}

export async function createAgent(workspaceId, createdBy, fields, { plan } = {}) {
  const handle = fields.handle.toLowerCase();
  const existing = await prisma.agent.findUnique({
    where: { workspaceId_handle: { workspaceId, handle } },
  });
  if (existing) throw new ConflictError(`@${handle} already exists in this workspace`);
  // Plan limit: max agents per workspace (PLAN.md §6).
  await assertAgentCap(workspaceId, plan);
  // An agent may only dispatch to a computer in its own workspace.
  if (fields.computerId) await assertComputerInWorkspace(fields.computerId, workspaceId);

  const result = await prisma.$transaction(async (tx) => {
    const agent = await tx.agent.create({
      data: {
        workspaceId,
        name: fields.name,
        handle,
        tagline: fields.tagline ?? null,
        systemPrompt: fields.systemPrompt ?? null,
        runtime: fields.runtime ?? DEFAULTS.AGENT_RUNTIME,
        model: fields.model ?? DEFAULTS.AGENT_MODEL,
        computerId: fields.computerId ?? null,
        approvalPolicy: { ...DEFAULT_APPROVAL_POLICY, ...(fields.approvalPolicy ?? {}) },
        createdBy,
      },
    });
    // Actor + workspace membership so the agent can be mentioned/post.
    const actor = await tx.actor.create({
      data: { kind: ACTOR_KIND.AGENT, agentId: agent.id },
    });
    await tx.agent.update({ where: { id: agent.id }, data: { actorId: actor.id } });
    await tx.workspaceMember.create({
      data: { workspaceId, actorId: actor.id, role: WORKSPACE_ROLE.AGENT },
    });
    const full = await tx.agent.findUnique({ where: { id: agent.id } });
    return serializeAgent(full);
  });
  // Phase 8 — onboarding funnel (after the tx commits).
  await markOnboardingStep(workspaceId, 'first_agent').catch(() => {});
  return result;
}

export async function listAgents(workspaceId) {
  const agents = await prisma.agent.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'asc' },
  });
  return agents.map(serializeAgent);
}

export async function getAgent(workspaceId, agentId) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent || agent.workspaceId !== workspaceId) throw new NotFoundError('Agent not found');
  return serializeAgent(agent);
}

export async function updateAgent(workspaceId, agentId, patch) {
  const existing = await getAgent(workspaceId, agentId);
  // An agent may only dispatch to a computer in its own workspace.
  if (patch.computerId) await assertComputerInWorkspace(patch.computerId, workspaceId);
  const data = { ...patch };
  // Merge approval-policy toggles over the stored object (don't drop keys).
  if (patch.approvalPolicy) {
    data.approvalPolicy = {
      ...DEFAULT_APPROVAL_POLICY,
      ...(existing.approvalPolicy ?? {}),
      ...patch.approvalPolicy,
    };
  }
  const updated = await prisma.agent.update({ where: { id: agentId }, data });
  return serializeAgent(updated);
}

async function assertComputerInWorkspace(computerId, workspaceId) {
  const computer = await prisma.computer.findUnique({ where: { id: computerId } });
  if (!computer || computer.workspaceId !== workspaceId) {
    throw new ValidationError('Computer not found in this workspace');
  }
}

export async function deleteAgent(workspaceId, agentId) {
  const agent = await getAgent(workspaceId, agentId);
  const actorId = agent.actorId;
  await prisma.$transaction(async (tx) => {
    // Delete the agent first (AgentRun etc. cascade on agentId).
    await tx.agent.delete({ where: { id: agentId } });
    // The Actor + workspace membership aren't cascade-removed by the Agent
    // delete (Actor.agentId has no onDelete), so clean them up explicitly —
    // otherwise orphaned members show up as blank rows in @mention suggestions
    // and the members list.
    if (actorId) {
      await tx.workspaceMember.deleteMany({ where: { actorId } }).catch(() => {});
      await tx.actor.deleteMany({ where: { id: actorId } }).catch(() => {});
    }
  });
}
