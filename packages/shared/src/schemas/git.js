/**
 * Git-based collaboration schemas (GIT_COLLABORATION.md, Phase 8+). GitHub
 * config for agents, task repo context, and the recorded-operation audit row.
 */
import { z } from 'zod';
import { uuidSchema } from './common.js';
import {
  COLLABORATION_MODES,
  GIT_OPERATION,
  GIT_OPERATION_STATUS,
  GIT_WORKFLOW,
} from '../constants.js';

const collaborationModeEnum = z.enum([
  COLLABORATION_MODES.AUTONOMOUS,
  COLLABORATION_MODES.SUPERVISED,
  COLLABORATION_MODES.INTERACTIVE,
  COLLABORATION_MODES.MANUAL,
]);

const gitWorkflowEnum = z.enum([GIT_WORKFLOW.FEATURE_BRANCH, GIT_WORKFLOW.TRUNK_BASED]);

/** A GitHub repository URL. HTTPS only — tokens never travel in the URL. */
export const repoUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .regex(
    /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+?(\.git)?$/i,
    'must be an https://github.com/ owner/repo URL',
  );

/** Any GitHub URL (repo or a deeper path like /pull/123). For PR URLs. */
export const githubUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .regex(
    /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\/[\w./-]+)?(\.git)?$/i,
    'must be an https://github.com/ URL',
  );

/**
 * Body for POST /agents/:agentId/github-config. `githubToken` is write-only —
 * it is encrypted at rest and never returned by any endpoint. An empty string
 * clears the stored token; omitting the key leaves it untouched (partial update).
 */
export const githubConfigSchema = z
  .object({
    githubToken: z.string().trim().max(400).optional(),
    defaultRepoUrl: repoUrlSchema.nullable().optional(),
    defaultBranch: z.string().trim().min(1).max(100).optional(),
    gitWorkflow: gitWorkflowEnum.nullable().optional(),
    collaborationMode: collaborationModeEnum.nullable().optional(),
  })
  .strict();

/** Body for POST /tasks/:taskId/git-operation — record a Git op the agent did. */
export const recordGitOperationSchema = z
  .object({
    agentId: uuidSchema, // the agent that performed the operation
    operation: z.enum(Object.values(GIT_OPERATION)),
    status: z.enum(Object.values(GIT_OPERATION_STATUS)),
    branch: z.string().trim().max(200).optional(),
    commitHash: z.string().trim().max(120).optional(),
    error: z.string().trim().max(4000).optional(),
    metadata: z.record(z.unknown()).optional(),
    // Convenience: also patch the task's branch / PR URL when the op establishes one.
    featureBranch: z.string().trim().max(200).nullable().optional(),
    pullRequestUrl: githubUrlSchema.nullable().optional(),
  })
  .strict();

/** Body for PATCH /tasks/:taskId/git-context — set the task's repo coordinates. */
export const taskGitContextSchema = z
  .object({
    githubRepo: repoUrlSchema.nullable().optional(),
    baseBranch: z.string().trim().min(1).max(100).nullable().optional(),
    featureBranch: z.string().trim().max(200).nullable().optional(),
    pullRequestUrl: githubUrlSchema.nullable().optional(),
    gitStatus: z.record(z.unknown()).nullable().optional(),
  })
  .strict();
