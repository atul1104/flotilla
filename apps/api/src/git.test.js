/**
 * Git-based collaboration (GIT_COLLABORATION.md, Phase 8+). Covers: at-rest
 * token crypto, the prompt builder, the GitHub-config endpoints, the task
 * GitOperation audit trail + status, the workspace repo roll-up, tenant
 * isolation, and the Phase 4 smart-handoff trigger.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { prisma } from './lib/db.js';
import { encrypt, decrypt } from './lib/crypto.js';
import { buildGitPrompt } from './modules/git/prompts.js';
import { COLLABORATION_MODES, GIT_OPERATION } from '@atul1104/shared';

const app = createApp();
const A = request.agent(app);
const stamp = () => Date.now().toString(36);

let workspaceId;
let generalId;
let computerId;
let coder;
let qa;
let task;

beforeAll(
  async () => {
    const email = `git-${stamp()}@t.co`;
    await prisma.user.deleteMany({ where: { email } });
    const signup = await A.post('/api/v1/auth/signup').send({
      email,
      name: 'Git Owner',
      password: 'supersecret-1',
      workspaceName: 'Git Co',
    });
    workspaceId = signup.body.workspace.id;
    const ch = await A.get(`/api/v1/workspaces/${workspaceId}/channels`);
    generalId = ch.body.items.find((c) => c.name === 'general').id;
    const computer = await prisma.computer.create({
      data: { workspaceId, ownerUserId: signup.body.user.id, name: 'git-box' },
    });
    computerId = computer.id;

    coder = (
      await A.post(`/api/v1/workspaces/${workspaceId}/agents`).send({
        name: 'Coder',
        handle: `coder-${stamp()}`,
        runtime: 'claude-code',
        computerId,
      })
    ).body;
    qa = (
      await A.post(`/api/v1/workspaces/${workspaceId}/agents`).send({
        name: 'QA',
        handle: 'qa',
        runtime: 'claude-code',
        computerId,
      })
    ).body;

    task = (
      await A.post(`/api/v1/workspaces/${workspaceId}/tasks`).send({
        title: 'Build todo app',
        description: 'Simple HTML/CSS/JS todo app',
        channelId: generalId,
      })
    ).body;
  },
  30000,
);

// ---------------------------------------------------------------------------
// Crypto (lib/crypto.js)
// ---------------------------------------------------------------------------
describe('git: token crypto', () => {
  it('encrypt -> decrypt round-trips and hides the plaintext', () => {
    const blob = encrypt('ghp_supersecret_token');
    expect(blob).toMatch(/^v1:/);
    expect(blob).not.toContain('ghp_supersecret_token');
    expect(decrypt(blob)).toBe('ghp_supersecret_token');
  });

  it('produces a unique ciphertext each time (random IV)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });

  it('rejects tampered / wrong-version blobs', () => {
    expect(() => decrypt('v2:bad')).toThrow();
    expect(() => decrypt('not-a-blob')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------
describe('git: prompt builder', () => {
  it('returns "" when no repo is configured', () => {
    expect(buildGitPrompt({ agentName: 'X', repoUrl: null })).toBe('');
  });

  it('includes repo, branches, workflow, and collaboration mode', () => {
    const p = buildGitPrompt({
      agentName: 'Coder',
      handle: 'coder',
      repoUrl: 'https://github.com/org/repo',
      featureBranch: 'feature/coder-todo',
      collaborationMode: COLLABORATION_MODES.SUPERVISED,
    });
    expect(p).toContain('https://github.com/org/repo');
    expect(p).toContain('feature/coder-todo');
    expect(p).toContain('feature-branch');
    expect(p).toContain('supervised');
  });
});

// ---------------------------------------------------------------------------
// Agent GitHub config
// ---------------------------------------------------------------------------
describe('git: agent github config', () => {
  it('POST encrypts the token at rest and never returns it', async () => {
    const res = await A.post(`/api/v1/agents/${coder.id}/github-config`).send({
      githubToken: 'ghp_supersecret_token',
      defaultRepoUrl: 'https://github.com/org/repo',
      defaultBranch: 'main',
      gitWorkflow: 'feature-branch',
      collaborationMode: 'supervised',
    });
    expect(res.status).toBe(200);
    expect(res.body.hasGithubToken).toBe(true);
    expect(res.body.defaultRepoUrl).toBe('https://github.com/org/repo');
    expect(JSON.stringify(res.body)).not.toContain('ghp_supersecret_token');

    const db = await prisma.agent.findUnique({ where: { id: coder.id } });
    expect(db.githubTokenEncrypted).toMatch(/^v1:/);
    expect(db.githubTokenEncrypted).not.toContain('ghp_supersecret_token');
    expect(decrypt(db.githubTokenEncrypted)).toBe('ghp_supersecret_token');
  });

  it('GET returns the config without a token field', async () => {
    const res = await A.get(`/api/v1/agents/${coder.id}/github-config`);
    expect(res.status).toBe(200);
    expect(res.body.hasGithubToken).toBe(true);
    expect(res.body.defaultRepoUrl).toBe('https://github.com/org/repo');
    expect(res.body).not.toHaveProperty('githubToken');
  });

  it('rejects a non-GitHub repo URL', async () => {
    const res = await A.post(`/api/v1/agents/${coder.id}/github-config`).send({
      defaultRepoUrl: 'https://gitlab.com/org/repo',
    });
    expect(res.status).toBe(400);
  });

  it('GET /agents/:id/git-status reflects config + last op', async () => {
    const res = await A.get(`/api/v1/agents/${coder.id}/git-status`);
    expect(res.status).toBe(200);
    expect(res.body.configuredRepo).toBe('https://github.com/org/repo');
  });
});

// ---------------------------------------------------------------------------
// Task GitOperation audit trail + status
// ---------------------------------------------------------------------------
describe('git: task operations', () => {
  it('PATCH git-context sets the task repo coordinates', async () => {
    const res = await A.patch(`/api/v1/tasks/${task.id}/git-context`).send({
      githubRepo: 'https://github.com/org/repo',
      baseBranch: 'main',
      featureBranch: 'feature/coder-todo',
    });
    expect(res.status).toBe(200);
    expect(res.body.githubRepo).toBe('https://github.com/org/repo');
    expect(res.body.featureBranch).toBe('feature/coder-todo');
  });

  it('POST records a push op and refreshes task.gitStatus', async () => {
    const res = await A.post(`/api/v1/tasks/${task.id}/git-operation`).send({
      agentId: coder.id,
      operation: GIT_OPERATION.PUSH,
      status: 'success',
      branch: 'feature/coder-todo',
      commitHash: 'abc1234',
      featureBranch: 'feature/coder-todo',
    });
    expect(res.status).toBe(201);
    expect(res.body.operation).toBe('push');
    expect(res.body.commitHash).toBe('abc1234');
    expect(res.body.completedAt).toBeTruthy();

    const status = await A.get(`/api/v1/tasks/${task.id}/git-status`);
    expect(status.status).toBe(200);
    expect(status.body.lastOperation.operation).toBe('push');
    expect(status.body.gitStatus.branch).toBe('feature/coder-todo');
  });

  it('GET git-operations lists the audit trail (newest first)', async () => {
    const res = await A.get(`/api/v1/tasks/${task.id}/git-operations`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0].operation).toBe('push');
  });

  it('records a failed op with an error message', async () => {
    const res = await A.post(`/api/v1/tasks/${task.id}/git-operation`).send({
      agentId: coder.id,
      operation: GIT_OPERATION.PULL,
      status: 'failed',
      branch: 'feature/coder-todo',
      error: 'merge conflict in src/index.js',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('failed');
    expect(res.body.error).toContain('merge conflict');
  });
});

// ---------------------------------------------------------------------------
// Workspace repo roll-up
// ---------------------------------------------------------------------------
describe('git: workspace repos', () => {
  it('rolls up configured repos with owner/repo parsed', async () => {
    const res = await A.get(`/api/v1/workspaces/${workspaceId}/github-repos`);
    expect(res.status).toBe(200);
    const repo = res.body.items.find((r) => r.url === 'https://github.com/org/repo');
    expect(repo).toBeTruthy();
    expect(repo.owner).toBe('org');
    expect(repo.repo).toBe('repo');
    expect(repo.agents.some((a) => a.handle === coder.handle)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 2/3 — agent-card git summary + runtime prompt composition
// ---------------------------------------------------------------------------
describe('git: agent card + runtime prompt', () => {
  it('surfaces the git summary on the agent card (token never serialized)', async () => {
    const res = await A.get(`/api/v1/agents/${coder.id}`);
    expect(res.status).toBe(200);
    expect(res.body.git.enabled).toBe(true);
    expect(res.body.git.repoUrl).toBe('https://github.com/org/repo');
    expect(res.body.git.collaborationMode).toBe('supervised');
    expect(res.body.git.hasGithubToken).toBe(true);
    expect(JSON.stringify(res.body.git)).not.toContain('ghp_');
  });

  it('composeSystemPrompt appends the Git section for a configured agent', async () => {
    const { composeSystemPrompt } = await import('./modules/git/service.js');
    const agent = await prisma.agent.findUnique({ where: { id: coder.id } });
    const prompt = composeSystemPrompt(agent);
    expect(prompt).toContain('Git collaboration context');
    expect(prompt).toContain('https://github.com/org/repo');
  });
});

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------
describe('git: tenant isolation', () => {
  it('forbids reading another workspace agent config', async () => {
    const email2 = `git2-${stamp()}@t.co`;
    await prisma.user.deleteMany({ where: { email: email2 } });
    const B = request.agent(app);
    await B.post('/api/v1/auth/signup').send({
      email: email2,
      name: 'Other Owner',
      password: 'supersecret-1',
      workspaceName: 'Other Co',
    });
    const res = await B.get(`/api/v1/agents/${coder.id}/github-config`);
    expect([403, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Phase 4 — smart handoff
// ---------------------------------------------------------------------------
describe('git: smart handoff (Phase 4)', () => {
  it('a successful PR op triggers a handoff run for @qa on the task', async () => {
    const res = await A.post(`/api/v1/tasks/${task.id}/git-operation`).send({
      agentId: coder.id,
      operation: GIT_OPERATION.PR,
      status: 'success',
      branch: 'feature/coder-todo',
      pullRequestUrl: 'https://github.com/org/repo/pull/1',
      metadata: { pullRequestUrl: 'https://github.com/org/repo/pull/1' },
    });
    expect(res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 50));
    const run = await prisma.agentRun.findFirst({
      where: { agentId: qa.id, taskId: task.id, trigger: 'handoff' },
    });
    expect(run).toBeTruthy();
  });

  it('a non-PR op does not trigger an extra qa handoff', async () => {
    await A.post(`/api/v1/tasks/${task.id}/git-operation`).send({
      agentId: coder.id,
      operation: GIT_OPERATION.COMMIT,
      status: 'success',
      branch: 'feature/coder-todo',
    });
    await new Promise((r) => setTimeout(r, 50));
    const runs = await prisma.agentRun.findMany({
      where: { agentId: qa.id, taskId: task.id, trigger: 'handoff' },
    });
    // exactly one handoff run — from the PR op above, not the commit
    expect(runs.length).toBe(1);
  });
});
