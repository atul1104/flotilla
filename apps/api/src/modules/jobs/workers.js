/**
 * pg-boss worker entrypoints (registered in lib/boss.js). Each takes the job
 * argument but does its own work; resolving completes the job, throwing fails it.
 */
import { fireScheduledTasks } from './scheduled-tasks.js';
import { sendDigests } from './digest.js';
import { cleanupOldEvents } from './retention.js';
import { logger } from '../../lib/logger.js';

export async function runScheduledTaskTick() {
  const fired = await fireScheduledTasks();
  if (fired > 0) logger.info({ fired }, 'scheduled tasks fired');
  return fired;
}

export async function runDailyJobs() {
  const digests = await sendDigests();
  const pruned = await cleanupOldEvents();
  logger.info({ digests, pruned }, 'daily jobs complete');
  return { digests, pruned };
}
