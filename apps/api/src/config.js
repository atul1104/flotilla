/**
 * Centralized env config. Reads from process.env / .env (loaded in server.js).
 * Throws early on missing required values so misconfig fails loud at boot.
 */
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.string().default('info'),

  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  API_ORIGIN: z.string().url().default('http://localhost:4000'),

  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be >= 16 chars'),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('flotilla-uploads'),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_FORCE_PATH_STYLE: z
    .union([z.string(), z.boolean()])
    .transform((v) => v === true || v === 'true')
    .default(true),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Flotilla <noreply@flotilla.local>'),

  // Phase 6 — web push (VAPID). Optional in dev (push disabled if absent).
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:dev@flotilla.local'),

  // Phase 8 — Sentry (optional; no-op when unset).
  SENTRY_DSN: z.string().optional(),

  // Phase 8+ — Git collaboration: at-rest GitHub-token encryption key (any
  // passphrase; the AES-256-GCM key is scrypt-derived from it). Falls back to
  // SESSION_SECRET, then an insecure dev value. Required for prod.
  GITHUB_TOKEN_ENCRYPTION_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  if (process.env.NODE_ENV !== 'test') {
    // Surface a readable error so dev knows exactly what's missing/malformed.
    console.error('❌ Invalid environment configuration:\n', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  // In test mode with no .env, fall through to safe defaults (see below).
}

export const config = {
  ...(parsed.success
    ? parsed.data
    : schema.parse({
        DATABASE_URL: 'x',
        SESSION_SECRET: 'test-secret-1234',
        S3_ENDPOINT: 'http://x',
        S3_ACCESS_KEY_ID: 'x',
        S3_SECRET_ACCESS_KEY: 'x',
      })),
  get isProd() {
    return this.NODE_ENV === 'production';
  },
  get isDev() {
    return this.NODE_ENV === 'development';
  },
  get isTest() {
    return this.NODE_ENV === 'test';
  },
};
