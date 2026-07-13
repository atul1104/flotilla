/**
 * Usage & cost dashboard (PLAN.md §2 #2, §15). Aggregates agent_runs over a
 * window: totals, a per-day series (for charts), and a per-agent breakdown.
 * Cost comes from agent_runs.cost_estimate_cents (set on finishRun). Raw SQL is
 * used for date-truncation + BigInt sums (Prisma can't group by date natively).
 */
import { prisma } from '../../lib/db.js';
import { USAGE } from '@flotilla/shared';

const toNum = (v) => Number(v ?? 0);

export async function getUsage(workspaceId, { days = USAGE.DEFAULT_WINDOW_DAYS } = {}) {
  const windowDays = Math.min(Math.max(1, days), USAGE.MAX_WINDOW_DAYS);
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [totals, dayRows, agentRows] = await Promise.all([
    prisma.agentRun.aggregate({
      where: { workspaceId, queuedAt: { gte: since } },
      _count: { _all: true },
      _sum: { tokensIn: true, tokensOut: true, costEstimateCents: true },
    }),
    prisma.$queryRaw`
      SELECT date_trunc('day', queued_at)::date AS day,
             COUNT(*)::int AS runs,
             COALESCE(SUM(tokens_in),0) AS "tokensIn",
             COALESCE(SUM(tokens_out),0) AS "tokensOut",
             COALESCE(SUM(cost_estimate_cents),0) AS "costCents"
      FROM agent_runs
      WHERE workspace_id = ${workspaceId}::uuid AND queued_at >= ${since}
      GROUP BY day ORDER BY day ASC
    `,
    prisma.$queryRaw`
      SELECT agent_id AS "agentId",
             COUNT(*)::int AS runs,
             COALESCE(SUM(tokens_in),0) AS "tokensIn",
             COALESCE(SUM(tokens_out),0) AS "tokensOut",
             COALESCE(SUM(cost_estimate_cents),0) AS "costCents"
      FROM agent_runs
      WHERE workspace_id = ${workspaceId}::uuid AND queued_at >= ${since}
      GROUP BY agent_id ORDER BY "costCents" DESC LIMIT 20
    `,
  ]);

  // Enrich per-agent rows with name/handle.
  const agentIds = agentRows.map((r) => r.agentId);
  const agents = agentIds.length
    ? await prisma.agent.findMany({ where: { id: { in: agentIds } } })
    : [];
  const agentById = new Map(agents.map((a) => [a.id, a]));

  return {
    windowDays,
    since,
    totals: {
      runs: totals._count._all,
      tokensIn: toNum(totals._sum.tokensIn),
      tokensOut: toNum(totals._sum.tokensOut),
      costCents: totals._sum.costEstimateCents ?? 0,
    },
    byDay: dayRows.map((r) => ({
      day: r.day,
      runs: r.runs,
      tokensIn: toNum(r.tokensIn),
      tokensOut: toNum(r.tokensOut),
      costCents: toNum(r.costCents),
    })),
    byAgent: agentRows.map((r) => {
      const a = agentById.get(r.agentId);
      return {
        agentId: r.agentId,
        name: a?.name ?? 'unknown',
        handle: a?.handle ?? null,
        runs: r.runs,
        tokensIn: toNum(r.tokensIn),
        tokensOut: toNum(r.tokensOut),
        costCents: toNum(r.costCents),
      };
    }),
  };
}
