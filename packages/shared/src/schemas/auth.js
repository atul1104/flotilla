/**
 * Auth request/response schemas. PLAN.md §7.1, §11.
 */
import { z } from 'zod';
import { uuidSchema, isoTimestamp, emailSchema } from './common.js';

// Re-export for backwards-compatible `import { emailSchema } from '@flotilla/shared/schemas/auth'`.
export { emailSchema };

export const signupSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(100),
  password: z.string().min(12).max(200), // argon2id; min 12 chars
  workspaceName: z.string().trim().min(1).max(80).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(12).max(200),
});

export const publicUserSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  name: z.string(),
  avatarUrl: z.string().url().nullable(),
  emailVerifiedAt: isoTimestamp.nullable(),
  createdAt: isoTimestamp,
});
