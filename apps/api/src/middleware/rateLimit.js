/**
 * Rate limiting (PLAN.md §11): per-IP on auth routes, per-user on message send.
 * Skipped in tests so the integration suite isn't throttled. Behind the
 * limiter, over-limit requests raise RateLimitError (429) via the error handler.
 */
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

const skip = () => config.isTest;
const handler = (_req, res) =>
  res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED' });

export const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler,
});

export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler,
});

export const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // also throttles runaway agents (Phase 4)
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  keyGenerator: (req) => req.actorId || req.ip,
  handler,
});
