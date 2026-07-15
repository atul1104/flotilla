/**
 * Plan-limit enforcement (PLAN.md §6 — "Plan limits enforced from day one").
 * The limits live in @flotila-org/shared PLAN_LIMITS; this module is the single
 * place that resolves a workspace's plan to its limits and exposes check helpers
 * so the rules aren't scattered across modules. Free plans gate; Pro/Enterprise
 * are uncapped (Infinity).
 */
import { PLAN_LIMITS, PLANS } from '@flotila-org/shared';
import { prisma } from './db.js';
import { PaymentRequiredError } from '@flotila-org/shared';

export function limitsForPlan(plan) {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS[PLANS.FREE];
}

/** Free plans gate message reads at N days (data retained, read gated). */
export function historyCutoff(plan) {
  const days = limitsForPlan(plan).messageHistoryDays;
  if (!Number.isFinite(days)) return null; // Infinity → no gate
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** True if a message with this createdAt is readable under the plan. */
export function isReadable(createdAt, plan) {
  const cutoff = historyCutoff(plan);
  return !cutoff || new Date(createdAt) >= cutoff;
}

/** Refuse if the workspace is at/over its agent cap. */
export async function assertAgentCap(workspaceId, plan) {
  const cap = limitsForPlan(plan).maxAgents;
  if (!Number.isFinite(cap)) return;
  const count = await prisma.agent.count({ where: { workspaceId } });
  if (count >= cap) {
    throw new PaymentRequiredError(
      `Agent limit reached (${count}/${cap}). Upgrade the workspace plan to add more agents.`,
    );
  }
}

/** Bytes already uploaded this calendar month in the workspace. */
export async function monthUploadBytes(workspaceId) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const res = await prisma.attachment.aggregate({
    where: { message: { channel: { workspaceId } }, createdAt: { gte: start } },
    _sum: { sizeBytes: true },
  });
  return Number(res._sum.sizeBytes ?? 0);
}

/** Refuse if uploading `size` more bytes would exceed the monthly quota. */
export async function assertUploadQuota(workspaceId, plan, size) {
  const cap = limitsForPlan(plan).uploadsBytesPerMonth;
  if (!Number.isFinite(cap)) return;
  const used = await monthUploadBytes(workspaceId);
  if (used + size > cap) {
    throw new PaymentRequiredError(
      `Upload quota exceeded (${Math.round(used / 1024 / 1024)} MB used / ${Math.round(
        cap / 1024 / 1024,
      )} MB). Upgrade the workspace plan.`,
    );
  }
}
