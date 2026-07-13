/**
 * Retention cleanup (PLAN.md §15 Phase 8 hardening, wired now so the run_events
 * table can't grow unbounded). Deletes run events older than the window. Free
 * plans also gate message *reads* at 30 days (PLAN_LIMITS) — data is retained,
 * only the read is gated, so no row deletion there.
 */
import { prisma } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';

const RUN_EVENT_RETENTION_DAYS = 90;

export async function cleanupOldEvents() {
  const cutoff = new Date(Date.now() - RUN_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const res = await prisma.runEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
  if (res.count > 0) logger.info({ deleted: res.count }, 'retention: pruned old run events');
  return res.count;
}
