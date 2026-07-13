/**
 * Scheduled-task firing (PLAN.md §2 #4 — cron-style recurring tasks). The
 * scheduled-task-tick pg-boss job calls fireScheduledTasks() each minute; it
 * evaluates each task's cron against the current minute (cronDue) and triggers a
 * run for the task's agent assignee, recording lastFiredAt so a tick never
 * double-fires. Pure cron math lives in @flotilla/shared (cron.js).
 */
import { prisma } from '../../lib/db.js';
import { cronDue } from '@flotilla/shared';
import * as runs from '../runs/service.js';
import { logger } from '../../lib/logger.js';

export async function fireScheduledTasks(now = new Date()) {
  const tasks = await prisma.task.findMany({
    where: {
      schedule: { not: null },
      status: { notIn: ['done', 'cancelled'] },
    },
    include: { assignee: true },
  });
  let fired = 0;
  for (const t of tasks) {
    const sched = t.schedule;
    if (!sched?.cron) continue;
    const last = sched.lastFiredAt ? new Date(sched.lastFiredAt) : null;
    if (!cronDue(sched.cron, now, last)) continue;
    // Scheduled tasks run as the task's agent assignee (an Actor whose agentId is set).
    const agentId = t.assignee?.agentId;
    if (!agentId) continue;
    try {
      await runs.triggerRun({
        workspaceId: t.workspaceId,
        agentId,
        taskId: t.id,
        triggerMessageId: t.rootMessageId ?? undefined,
        contextText: t.description || `Scheduled run for: ${t.title}`,
        trigger: 'schedule',
      });
      await prisma.task.update({
        where: { id: t.id },
        data: { schedule: { ...sched, lastFiredAt: now.toISOString() } },
      });
      fired += 1;
    } catch (err) {
      logger.warn({ err, taskId: t.id }, 'scheduled task fire failed');
    }
  }
  return fired;
}
