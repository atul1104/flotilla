/**
 * Common Zod primitives reused across domain schemas. Enums are derived from
 * constants.js so there is one source of truth (PLAN.md §6).
 */
import { z } from 'zod';
import {
  ACTOR_KIND,
  CHANNEL_KIND,
  NOTIFY_LEVEL,
  PAGINATION,
  PLANS,
  TASK_STATUS,
  WORKSPACE_ROLE,
  AGENT_STATUS,
  RUNTIME,
  COMPUTER_STATUS,
  RUN_STATUS,
  RUN_EVENT_TYPE,
  APPROVAL_DECISION,
} from '../constants.js';

/** UUID v4 (Postgres stores uuid). Accepts any canonical UUID. */
export const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'invalid uuid');

export const cuidSchema = z.string().min(1);

/** Cursor pagination query (?cursor=&limit=). PLAN.md §7. */
export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});

export function paginatedResponse(itemSchema) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });
}

export const isoTimestamp = z.string().datetime({ offset: true });

// Enums (from constants so values never drift)
export const planSchema = z.enum([PLANS.FREE, PLANS.PRO, PLANS.ENTERPRISE]);
export const actorKindSchema = z.enum([ACTOR_KIND.USER, ACTOR_KIND.AGENT]);
export const workspaceRoleSchema = z.enum([
  WORKSPACE_ROLE.OWNER,
  WORKSPACE_ROLE.ADMIN,
  WORKSPACE_ROLE.MEMBER,
  WORKSPACE_ROLE.AGENT,
]);
export const channelKindSchema = z.enum([
  CHANNEL_KIND.PUBLIC,
  CHANNEL_KIND.PRIVATE,
  CHANNEL_KIND.DM,
]);
export const notifyLevelSchema = z.enum([
  NOTIFY_LEVEL.ALL,
  NOTIFY_LEVEL.MENTIONS,
  NOTIFY_LEVEL.NOTHING,
]);
export const taskStatusSchema = z.enum([
  TASK_STATUS.BACKLOG,
  TASK_STATUS.CLAIMED,
  TASK_STATUS.RUNNING,
  TASK_STATUS.NEEDS_REVIEW,
  TASK_STATUS.DONE,
  TASK_STATUS.CANCELLED,
]);
export const agentStatusSchema = z.enum([
  AGENT_STATUS.IDLE,
  AGENT_STATUS.RUNNING,
  AGENT_STATUS.OFFLINE,
]);
export const runtimeSchema = z.enum([
  RUNTIME.CLAUDE_CODE,
  RUNTIME.OPENAI_API,
  RUNTIME.CODEX,
  RUNTIME.MOCK,
]);
export const computerStatusSchema = z.enum([COMPUTER_STATUS.ONLINE, COMPUTER_STATUS.OFFLINE]);
export const runStatusSchema = z.enum([
  RUN_STATUS.QUEUED,
  RUN_STATUS.DISPATCHED,
  RUN_STATUS.RUNNING,
  RUN_STATUS.AWAITING_APPROVAL,
  RUN_STATUS.SUCCEEDED,
  RUN_STATUS.FAILED,
  RUN_STATUS.CANCELLED,
]);
export const runEventTypeSchema = z.enum([
  RUN_EVENT_TYPE.STATUS,
  RUN_EVENT_TYPE.THINKING,
  RUN_EVENT_TYPE.TOOL_USE,
  RUN_EVENT_TYPE.TOOL_RESULT,
  RUN_EVENT_TYPE.APPROVAL_REQUEST,
  RUN_EVENT_TYPE.CHUNK,
  RUN_EVENT_TYPE.FINAL,
]);
export const approvalDecisionSchema = z.enum([
  APPROVAL_DECISION.APPROVED,
  APPROVAL_DECISION.DENIED,
]);

/** A non-empty trimmed string with a max length. */
export const trimmed = (max = 10_000) => z.string().trim().min(1).max(max);

/** Lowercased, validated email (stored pre-lowercased; citext deferred). */
export const emailSchema = z.string().trim().toLowerCase().email().max(254);

/** `@handle` — lowercase letters/digits/dash/underscore, 1–40 chars. */
export const handleSchema = z
  .string()
  .regex(/^@[a-z0-9][a-z0-9_-]{0,39}$/i, 'invalid handle (expected @name)');
