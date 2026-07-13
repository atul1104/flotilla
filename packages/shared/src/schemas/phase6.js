/**
 * Phase 6 schemas — notifications, web push, search, usage, agent teams,
 * scheduled tasks (PLAN.md §15). Validation for the new request shapes.
 */
import { z } from 'zod';
import { uuidSchema } from './common.js';
import { parseCron } from '../cron.js';
import { AGENT_TEAM_TEMPLATES, USAGE } from '../constants.js';

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export const markNotificationsReadSchema = z.object({
  ids: z.array(uuidSchema).max(100).optional(), // omit/empty => mark all read
});

export const notificationSchema = z.object({
  id: uuidSchema,
  type: z.string(),
  payload: z.unknown(),
  readAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
});

// ---------------------------------------------------------------------------
// Web push
// ---------------------------------------------------------------------------
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
  expirationTime: z.number().int().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Search (FTS)
// ---------------------------------------------------------------------------
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  type: z.enum(['messages', 'tasks', 'files']).optional(),
});

// ---------------------------------------------------------------------------
// Usage dashboard
// ---------------------------------------------------------------------------
export const usageQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .min(1)
    .max(USAGE.MAX_WINDOW_DAYS)
    .default(USAGE.DEFAULT_WINDOW_DAYS),
});

// ---------------------------------------------------------------------------
// Agent team templates
// ---------------------------------------------------------------------------
export const agentTeamSchema = z.object({
  template: z.enum(Object.keys(AGENT_TEAM_TEMPLATES)),
  computerId: uuidSchema.optional(), // bind all created agents to one computer
});

// ---------------------------------------------------------------------------
// Scheduled tasks (cron + tz). The cron expression is validated by parsing it.
// ---------------------------------------------------------------------------
export const scheduleSchema = z
  .object({
    cron: z
      .string()
      .trim()
      .refine((v) => {
        try {
          return parseCron(v) && true;
        } catch {
          return false;
        }
      }, 'invalid 5-field cron expression'),
    tz: z.string().trim().max(60).optional(),
    lastFiredAt: z.string().datetime({ offset: true }).optional(),
  })
  .nullable();
