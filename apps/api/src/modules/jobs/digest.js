/**
 * Daily notification digest (PLAN.md §15 — mention/task/approval emails). For
 * each user with unread notifications from the last 24h, send a plain-text
 * summary. Best-effort: a flaky mailer never blocks the job.
 */
import { prisma } from '../../lib/db.js';
import { sendMail } from '../../lib/mailer.js';
import { config } from '../../config.js';
import { logger } from '../../lib/logger.js';
import { escapeHtml } from '../workspaces/router.js';

export async function sendDigests() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // Group unread recent notifications by user.
  const groups = await prisma.notification.groupBy({
    by: ['userId'],
    where: { readAt: null, createdAt: { gte: since } },
    _count: { _all: true },
  });
  for (const g of groups) {
    try {
      const user = await prisma.user.findUnique({ where: { id: g.userId } });
      if (!user?.email) continue;
      const recent = await prisma.notification.findMany({
        where: { userId: g.userId, readAt: null, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      const lines = recent.map((n) => `- ${n.type}: ${describe(n.payload)}`);
      const text = `You have ${g._count._all} new notification(s) on Flotilla:\n\n${lines.join('\n')}\n\n${config.APP_ORIGIN}`;
      const wsName = recent[0]?.payload?.workspaceName || 'Flotilla';
      await sendMail({
        to: user.email,
        subject: `Flotilla — ${g._count._all} new notification(s)`,
        text,
        html: `<p>You have <strong>${escapeHtml(String(g._count._all))}</strong> new notification(s) on ${escapeHtml(wsName)}:</p><ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`,
      });
    } catch (err) {
      logger.warn({ err, userId: g.userId }, 'digest send failed');
    }
  }
  return groups.length;
}

function describe(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return String(payload.title || payload.message || payload.type || '');
}
