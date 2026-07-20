/**
 * Agent + computer + run schemas (PLAN.md §6, §7.1, §8). Agents are actors;
 * runs stream events from the daemon.
 */
import { z } from 'zod';
import {
  uuidSchema,
  isoTimestamp,
  runtimeSchema,
  agentStatusSchema,
  runStatusSchema,
  approvalDecisionSchema,
} from './common.js';
import { APPROVAL_POLICY_KEYS, ARTIFACT_TYPE, MESSAGE_PAYLOAD_TYPE } from '../constants.js';

// ---------------------------------------------------------------------------
// Approval policy (improvement #3) + approval/artifact message payloads
// ---------------------------------------------------------------------------
/**
 * Per-agent approval gates (PLAN.md §2 #3, §11). Stored as jsonb on
 * `agents.approval_policy`. Unknown keys are tolerated (forward-compat) but the
 * web editor only writes the known booleans below.
 */
export const approvalPolicySchema = z
  .object({
    [APPROVAL_POLICY_KEYS.SHELL]: z.boolean().optional(),
    [APPROVAL_POLICY_KEYS.FILE_WRITE]: z.boolean().optional(),
    [APPROVAL_POLICY_KEYS.OUTSIDE_WORKSPACE]: z.boolean().optional(),
    [APPROVAL_POLICY_KEYS.ALL_TOOLS]: z.boolean().optional(),
  })
  .strict();

/** Body for POST /approvals/:id/decide. */
export const decideApprovalSchema = z.object({
  decision: approvalDecisionSchema,
});

/** Daemon→server approval request (a run.event payload, type 'approval_request'). */
export const approvalRequestPayloadSchema = z.object({
  action: z.string().trim().min(1).max(40), // e.g. 'shell' | 'file_write' | 'tool'
  label: z.string().trim().max(200).optional(), // human-readable detail (the command, path)
  risk: z.enum(['low', 'medium', 'high']).default('medium'),
});

/**
 * Artifact payload (improvement #6) — rendered by the ArtifactViewer instead of
 * a raw text dump. `diff` is unified diff text; `code` has a language tag;
 * `markdown` is rich text; `image` previews an attachment/URL.
 */
export const artifactPayloadSchema = z.object({
  type: z.literal(MESSAGE_PAYLOAD_TYPE.ARTIFACT),
  artifactType: z.enum([
    ARTIFACT_TYPE.DIFF,
    ARTIFACT_TYPE.CODE,
    ARTIFACT_TYPE.MARKDOWN,
    ARTIFACT_TYPE.IMAGE,
  ]),
  title: z.string().trim().max(200).optional(),
  language: z.string().trim().max(40).optional(),
  content: z.string().max(100_000).optional(), // diff / code / markdown
  url: z.string().url().optional(), // image
  runId: uuidSchema.optional(),
});

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------
export const createAgentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, 'handle: lowercase, 1–40 chars'),
  tagline: z.string().trim().max(140).optional(),
  systemPrompt: z.string().trim().max(20_000).optional(),
  runtime: runtimeSchema.default('claude-code'),
  model: z.string().trim().max(80).optional(),
  computerId: uuidSchema,
  approvalPolicy: approvalPolicySchema.optional(),
});

export const updateAgentSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  tagline: z.string().trim().max(140).nullable().optional(),
  systemPrompt: z.string().trim().max(20_000).nullable().optional(),
  model: z.string().trim().max(80).nullable().optional(),
  computerId: uuidSchema.nullable().optional(),
  approvalPolicy: approvalPolicySchema.optional(),
});

export const agentSchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  actorId: uuidSchema.nullable(),
  name: z.string(),
  handle: z.string(),
  avatarUrl: z.string().nullable(),
  tagline: z.string().nullable(),
  systemPrompt: z.string().nullable(),
  runtime: runtimeSchema,
  model: z.string().nullable(),
  computerId: uuidSchema.nullable(),
  approvalPolicy: z.record(z.unknown()),
  status: agentStatusSchema,
  createdAt: isoTimestamp,
});

// ---------------------------------------------------------------------------
// Computers + pairing
// ---------------------------------------------------------------------------
export const pairSchema = z.object({
  code: z.string().min(8).max(512),
  name: z.string().trim().min(1).max(80).default('My computer'),
  platform: z.string().trim().max(40).optional(),
  daemonVersion: z.string().trim().max(40).optional(),
});

export const computerSchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  name: z.string(),
  platform: z.string().nullable(),
  daemonVersion: z.string().nullable(),
  status: z.enum(['online', 'offline']),
  lastSeenAt: isoTimestamp.nullable(),
  createdAt: isoTimestamp,
});

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------
export const runEventIngestSchema = z.object({
  runId: uuidSchema,
  seq: z.number().int().nonnegative(),
  type: z.string().min(1).max(40),
  payload: z.unknown().default({}),
});

export const runMessageSchema = z.object({
  runId: uuidSchema,
  content: z.string().min(1).max(50_000),
  payload: z.unknown().optional(),
});

export const runFinishedSchema = z.object({
  runId: uuidSchema,
  status: z.enum(['succeeded', 'failed', 'cancelled']),
  usage: z
    .object({ tokensIn: z.number().int().nonnegative(), tokensOut: z.number().int().nonnegative() })
    .optional(),
  error: z.string().optional(),
});

export const runSchema = z.object({
  id: uuidSchema,
  agentId: uuidSchema,
  computerId: uuidSchema.nullable(),
  workspaceId: uuidSchema,
  taskId: uuidSchema.nullable(),
  triggerMessageId: uuidSchema.nullable(),
  parentRunId: uuidSchema.nullable(),
  chainDepth: z.number().int().nonnegative(),
  trigger: z.string(),
  status: runStatusSchema,
  model: z.string().nullable(),
  tokensIn: z.number(),
  tokensOut: z.number(),
  error: z.string().nullable(),
  queuedAt: isoTimestamp,
  startedAt: isoTimestamp.nullable(),
  finishedAt: isoTimestamp.nullable(),
});
