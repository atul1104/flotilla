/**
 * pg-boss wrapper (PLAN.md §3 — jobs/schedules). Same Postgres as the app; the
 * boss schema is created on start. Workers (scheduled-task tick, daily digest +
 * retention) are registered here. Skipped in test so the suite isn't queue-bound;
 * the worker logic lives in modules/jobs and is unit-tested directly.
 */
import PgBoss from 'pg-boss';
import { config } from '../config.js';
import { logger } from './logger.js';
import { runScheduledTaskTick, runDailyJobs } from '../modules/jobs/workers.js';

let boss = null;

export async function initBoss() {
  if (config.isTest) return null; // tests exercise worker logic directly
  boss = new PgBoss({ connectionString: config.DATABASE_URL });
  boss.on('error', (err) => logger.warn({ err }, 'pg-boss error'));
  await boss.start();

  // Every minute, evaluate scheduled tasks whose cron is due (PLAN.md §2 #4).
  await boss.schedule('scheduled-task-tick', {}, { cron: '* * * * *' }).catch(() => {});
  await boss.work('scheduled-task-tick', { batchSize: 1 }, runScheduledTaskTick).catch(() => {});

  // Once-daily digest + retention (09:17 local — off the top of the hour).
  await boss.schedule('daily-jobs', {}, { cron: '17 9 * * *' }).catch(() => {});
  await boss.work('daily-jobs', { batchSize: 1 }, runDailyJobs).catch(() => {});

  logger.info('pg-boss started (scheduled-task-tick + daily-jobs)');
  return boss;
}

export function getBoss() {
  return boss;
}

export async function stopBoss() {
  if (!boss) return;
  await boss.stop();
  boss = null;
}
