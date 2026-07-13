/**
 * Task schemas (PLAN.md §6, §7.1). Status lifecycle: backlog → claimed →
 * running → needs_review → done (or cancelled). Kanban board over the same data.
 */
import { z } from 'zod';
import { uuidSchema, isoTimestamp, taskStatusSchema } from './common.js';
import { scheduleSchema } from './phase6.js';

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(20_000).optional(),
  channelId: uuidSchema.optional(),
  assigneeId: uuidSchema.optional(),
  priority: z.number().int().min(0).max(5).default(2),
  dueAt: isoTimestamp.optional(),
  schedule: scheduleSchema.optional(), // Phase 6 — {cron, tz} recurring task
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(20_000).nullable().optional(),
  status: taskStatusSchema.optional(),
  assigneeId: uuidSchema.nullable().optional(),
  priority: z.number().int().min(0).max(5).optional(),
  dueAt: isoTimestamp.nullable().optional(),
  schedule: scheduleSchema.nullable().optional(),
});

export const handoffSchema = z.object({
  toActorId: uuidSchema,
});

export const taskQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  assigneeId: uuidSchema.optional(),
});

export const taskSchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  channelId: uuidSchema.nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: z.number().int(),
  createdById: uuidSchema,
  createdBy: z.object({ id: uuidSchema, name: z.string().nullable() }).nullable().optional(),
  assigneeId: uuidSchema.nullable(),
  assignee: z
    .object({ id: uuidSchema, name: z.string().nullable(), kind: z.string().optional() })
    .nullable()
    .optional(),
  rootMessageId: uuidSchema.nullable(),
  dueAt: isoTimestamp.nullable(),
  schedule: z.unknown().nullable().optional(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  completedAt: isoTimestamp.nullable(),
});
