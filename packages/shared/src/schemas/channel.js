/**
 * Channel + message schemas. PLAN.md §6, §7.1.
 */
import { z } from 'zod';
import { uuidSchema, isoTimestamp, channelKindSchema, actorKindSchema, trimmed } from './common.js';

export const createChannelSchema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'channel name: lowercase, 1–40 chars, digits/dashes'),
  kind: channelKindSchema.exclude(['dm']).default('public'),
  memberActorIds: z.array(uuidSchema).optional(), // for private channels
  topic: z.string().trim().max(500).optional(),
});

export const updateChannelSchema = z.object({
  name: z.string().trim().toLowerCase().max(40).optional(),
  topic: z.string().trim().max(500).optional(),
  archivedAt: isoTimestamp.nullable().optional(),
});

export const channelSchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  name: z.string(),
  topic: z.string().nullable(),
  kind: channelKindSchema,
  createdBy: uuidSchema.nullable(),
  memberCount: z.number().int().nonnegative().optional(),
  lastReadMessageId: uuidSchema.nullable().optional(),
  unreadCount: z.number().int().nonnegative().optional(),
  hasUnreads: z.boolean().optional(),
  createdAt: isoTimestamp,
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
export const createMessageSchema = z.object({
  content: trimmed(50_000),
  threadRootId: uuidSchema.nullable().optional(),
  attachmentIds: z.array(uuidSchema).max(20).optional(),
  clientNonce: z.string().max(100).optional(), // optimistic-send dedupe
});

export const updateMessageSchema = z.object({
  content: trimmed(50_000),
});

export const messageSchema = z.object({
  id: uuidSchema,
  channelId: uuidSchema,
  senderId: uuidSchema,
  senderKind: actorKindSchema,
  senderName: z.string().nullable(),
  senderAvatarUrl: z.string().nullable(),
  threadRootId: uuidSchema.nullable(),
  content: z.string(),
  payload: z.unknown().nullable(),
  runId: uuidSchema.nullable(),
  editedAt: isoTimestamp.nullable(),
  createdAt: isoTimestamp,
  reactions: z
    .array(z.object({ emoji: z.string(), count: z.number().int(), reactors: z.array(uuidSchema) }))
    .optional(),
});

export const addReactionSchema = z.object({
  emoji: z.string().trim().min(1).max(32),
});

export const typingStartSchema = z.object({
  channelId: uuidSchema,
});
