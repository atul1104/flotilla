/**
 * Workspace + member + invite schemas. PLAN.md §6, §7.1.
 */
import { z } from 'zod';
import {
  uuidSchema,
  isoTimestamp,
  planSchema,
  workspaceRoleSchema,
  emailSchema,
} from './common.js';

const slugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}$/i, 'slug must be 2–39 chars: letters, digits, dashes');

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: slugSchema.optional(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  settings: z.record(z.unknown()).optional(),
});

export const workspaceSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  plan: planSchema,
  settings: z.record(z.unknown()),
  createdAt: isoTimestamp,
});

export const workspaceMemberSchema = z.object({
  actorId: uuidSchema,
  kind: z.enum(['user', 'agent']),
  role: workspaceRoleSchema,
  userId: uuidSchema.nullable(),
  agentId: uuidSchema.nullable(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  joinedAt: isoTimestamp,
});

export const createInviteSchema = z.object({
  email: emailSchema,
  role: z.enum(['admin', 'member']).default('member'),
});

export const acceptInviteSchema = z.object({
  // if accepting as an existing logged-in user, no body needed; if new, provide creds
  name: z.string().trim().min(1).max(100).optional(),
  password: z.string().min(12).max(200).optional(),
});
