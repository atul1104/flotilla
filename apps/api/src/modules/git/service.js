/**
 * Git collaboration business logic (GIT_COLLABORATION.md). GitHub config for
 * agents (token encrypted at rest), the per-task GitOperation audit trail, and
 * the workspace repo roll-up. Real `git` execution happens on the daemon; the
 * API records + serves the resulting state (persist-first, PLAN.md §4).
 */
import { prisma } from '../../lib/db.js';
import { NotFoundError } from '@atul1104/shared';
import { GIT_OPERATION_STATUS } from '@atul1104/shared';
import { encrypt, decrypt } from '../../lib/crypto.js';
import { buildGitPrompt } from './prompts.js';

export function serializeGitOperation(op) {
  return {
    id: op.id,
    agentId: op.agentId,
    taskId: op.taskId,
    operation: op.operation,
    status: op.status,
    branch: op.branch,
    commitHash: op.commitHash,
    error: op.error,
    metadata: op.metadata ?? null,
    createdAt: op.createdAt,
    completedAt: op.completedAt,
  };
}

async function loadAgent(workspaceId, agentId) {
  const a = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!a || a.workspaceId !== workspaceId) throw new NotFoundError('Agent not found');
  return a;
}

async function loadTask(workspaceId, taskId) {
  const t = await prisma.task.findUnique({ where: { id: taskId } });
  if (!t || t.workspaceId !== workspaceId) throw new NotFoundError('Task not found');
  return t;
}

// ---------------------------------------------------------------------------
// Agent GitHub config
// ---------------------------------------------------------------------------
/** Public view of an agent's GitHub config — the token is never returned. */
export function serializeGithubConfig(agent) {
  return {
    agentId: agent.id,
    hasGithubToken: Boolean(agent.githubTokenEncrypted),
    defaultRepoUrl: agent.defaultRepoUrl,
    defaultBranch: agent.defaultBranch,
    gitWorkflow: agent.gitWorkflow,
    collaborationMode: agent.collaborationMode,
  };
}

/** Set / update an agent's GitHub config. `githubToken` is write-only. */
export async function setGithubConfig(workspaceId, agentId, patch) {
  const agent = await loadAgent(workspaceId, agentId);
  const data = {};
  if (patch.githubToken !== undefined) {
    // Empty/blank => clear; non-empty => encrypt at rest.
    data.githubTokenEncrypted = patch.githubToken && patch.githubToken.trim()
      ? encrypt(patch.githubToken)
      : null;
  }
  if (patch.defaultRepoUrl !== undefined) data.defaultRepoUrl = patch.defaultRepoUrl;
  if (patch.defaultBranch !== undefined) data.defaultBranch = patch.defaultBranch;
  if (patch.gitWorkflow !== undefined) data.gitWorkflow = patch.gitWorkflow;
  if (patch.collaborationMode !== undefined) data.collaborationMode = patch.collaborationMode;
  const updated = await prisma.agent.update({ where: { id: agent.id }, data });
  return serializeGithubConfig(updated);
}

export async function getGithubConfig(workspaceId, agentId) {
  return serializeGithubConfig(await loadAgent(workspaceId, agentId));
}

/** Decrypt the stored GitHub token (server/daemon use only). Null if unset or
 *  unreadable — never throws, so a bad key can't crash a request. */
export function decryptGithubToken(agent) {
  if (!agent?.githubTokenEncrypted) return null;
  try {
    return decrypt(agent.githubTokenEncrypted);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Task GitOperation audit trail
// ---------------------------------------------------------------------------
/** Record a Git operation against a task. Refreshes task.gitStatus + the
 *  task's feature branch / PR URL when the op establishes one. */
export async function recordGitOperation(workspaceId, taskId, patch) {
  const task = await loadTask(workspaceId, taskId);
  await loadAgent(workspaceId, patch.agentId); // validates the agent is in-workspace
  const created = await prisma.$transaction(async (tx) => {
    const op = await tx.gitOperation.create({
      data: {
        agentId: patch.agentId,
        taskId: task.id,
        operation: patch.operation,
        status: patch.status,
        branch: patch.branch ?? null,
        commitHash: patch.commitHash ?? null,
        error: patch.error ?? null,
        metadata: patch.metadata ?? undefined,
        completedAt: patch.status === GIT_OPERATION_STATUS.PENDING ? null : new Date(),
      },
    });
    const taskPatch = {};
    if (patch.featureBranch !== undefined) taskPatch.featureBranch = patch.featureBranch;
    if (patch.pullRequestUrl !== undefined) taskPatch.pullRequestUrl = patch.pullRequestUrl;
    // Keep a fresh status snapshot on the task (dashboard reads this).
    taskPatch.gitStatus = {
      branch: patch.branch ?? task.featureBranch ?? null,
      commitHash: patch.commitHash ?? null,
      pullRequestUrl: patch.pullRequestUrl ?? task.pullRequestUrl ?? null,
      lastOperation: { type: patch.operation, status: patch.status, at: op.createdAt },
    };
    await tx.task.update({ where: { id: task.id }, data: taskPatch });
    return op;
  });
  return serializeGitOperation(created);
}

export async function listGitOperations(workspaceId, taskId) {
  await loadTask(workspaceId, taskId);
  const ops = await prisma.gitOperation.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return ops.map(serializeGitOperation);
}

/** Compute a task's Git status: stored coordinates + the most recent operation. */
export async function getTaskGitStatus(workspaceId, taskId) {
  const task = await loadTask(workspaceId, taskId);
  const recent = await prisma.gitOperation.findFirst({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
  });
  return {
    taskId: task.id,
    githubRepo: task.githubRepo,
    baseBranch: task.baseBranch,
    featureBranch: task.featureBranch,
    pullRequestUrl: task.pullRequestUrl,
    gitStatus: task.gitStatus ?? null,
    lastOperation: recent ? serializeGitOperation(recent) : null,
  };
}

/** Agent-card Git dashboard data: configured repo + its most recent operation. */
export async function getAgentGitStatus(workspaceId, agentId) {
  const agent = await loadAgent(workspaceId, agentId);
  const latest = await prisma.gitOperation.findFirst({
    where: { agentId },
    orderBy: { createdAt: 'desc' },
  });
  return {
    agentId: agent.id,
    configuredRepo: agent.defaultRepoUrl,
    defaultBranch: agent.defaultBranch,
    collaborationMode: agent.collaborationMode,
    currentBranch: latest?.branch ?? null,
    lastOperation: latest ? serializeGitOperation(latest) : null,
  };
}

/** Set a task's repo coordinates (repo / base / feature branch / PR URL). */
export async function setTaskGitContext(workspaceId, taskId, patch) {
  const task = await loadTask(workspaceId, taskId);
  const updated = await prisma.task.update({ where: { id: task.id }, data: patch });
  return {
    taskId: updated.id,
    githubRepo: updated.githubRepo,
    baseBranch: updated.baseBranch,
    featureBranch: updated.featureBranch,
    pullRequestUrl: updated.pullRequestUrl,
    gitStatus: updated.gitStatus ?? null,
  };
}

// ---------------------------------------------------------------------------
// Workspace repo roll-up
// ---------------------------------------------------------------------------
/**
 * Distinct repositories configured across the workspace's agents. Live GitHub
 * API listing (per-token /user/repos) is a documented enhancement; this returns
 * the repos the workspace is actually wired to, grouped by URL.
 */
export async function listWorkspaceRepos(workspaceId) {
  const agents = await prisma.agent.findMany({
    where: { workspaceId, defaultRepoUrl: { not: null } },
    select: {
      id: true,
      handle: true,
      name: true,
      defaultRepoUrl: true,
      defaultBranch: true,
      collaborationMode: true,
    },
  });
  const byUrl = new Map();
  for (const a of agents) {
    const entry =
      byUrl.get(a.defaultRepoUrl) ?? { url: a.defaultRepoUrl, owner: null, repo: null, agents: [] };
    const m = a.defaultRepoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
    if (m) {
      entry.owner = m[1];
      entry.repo = m[2];
    }
    entry.agents.push({
      id: a.id,
      handle: a.handle,
      name: a.name,
      defaultBranch: a.defaultBranch,
      collaborationMode: a.collaborationMode,
    });
    byUrl.set(a.defaultRepoUrl, entry);
  }
  return [...byUrl.values()];
}

// ---------------------------------------------------------------------------
// Agent prompt composition
// ---------------------------------------------------------------------------
/** Compose the Git section to append to an agent's system prompt. '' if the
 *  agent has no repo configured (non-Git agents are unaffected). */
export function getAgentGitSection(agent) {
  return buildGitPrompt({
    agentName: agent.name,
    handle: agent.handle,
    repoUrl: agent.defaultRepoUrl,
    baseBranch: agent.defaultBranch,
    collaborationMode: agent.collaborationMode,
    gitWorkflow: agent.gitWorkflow,
  });
}

/** Full system prompt = the agent's base prompt + the Git section (if any). */
export function composeSystemPrompt(agent) {
  const base = agent.systemPrompt ?? '';
  const git = getAgentGitSection(agent);
  return git ? `${base}${git}` : base;
}
