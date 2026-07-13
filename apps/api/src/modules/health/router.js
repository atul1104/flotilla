import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { prisma } from '../../lib/db.js';
import { config } from '../../config.js';
import { getBoss } from '../../lib/boss.js';
import { isPushEnabled } from '../push/service.js';

export const router = Router();

/** Liveness + readiness probe. Checks DB + pg-boss + push (Phase 8 depth). */
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const started = Date.now();
    let db = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      db = 'error';
      return res.status(503).json({
        status: 'unhealthy',
        db,
        uptime_s: Math.round(process.uptime()),
        env: config.NODE_ENV,
        error: err.message,
      });
    }
    // pg-boss connectivity (best-effort; absent in test). countStates() is a
    // real query against the queue schema (pg-boss v10 has no countArchived).
    let jobs = 'disabled';
    try {
      const boss = getBoss();
      if (boss) {
        await boss.countStates();
        jobs = 'ok';
      }
    } catch {
      jobs = 'error';
    }
    return res.json({
      status: 'ok',
      db,
      jobs,
      push: isPushEnabled() ? 'enabled' : 'disabled',
      latency_ms: Date.now() - started,
      uptime_s: Math.round(process.uptime()),
      env: config.NODE_ENV,
      version: process.env.npm_package_version || '0.0.0',
    });
  }),
);
