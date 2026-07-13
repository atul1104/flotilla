/**
 * Onboarding funnel metrics (PLAN.md §15 — Phase 8). Tracks which steps a
 * workspace has completed using the existing `workspace.settings` jsonb (no
 * schema change). Steps: workspace_created → computer_paired → first_agent →
 * first_run. Read via GET /workspaces/:id/onboarding.
 */
import { prisma } from '../../lib/db.js';

const STEPS = ['workspace_created', 'computer_paired', 'first_agent', 'first_run'];

/** Record that a step completed (idempotent). */
export async function markOnboardingStep(workspaceId, step) {
  if (!STEPS.includes(step)) return;
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) return;
  const settings = (ws.settings && typeof ws.settings === 'object' ? ws.settings : {}) || {};
  const onboarding = { ...(settings.onboarding ?? {}) };
  if (onboarding[step]) return; // already done
  onboarding[step] = new Date().toISOString();
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { settings: { ...settings, onboarding } },
  });
}

/** Return the funnel state + completion fraction. */
export async function getOnboarding(workspaceId) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  const settings = (ws?.settings && typeof ws.settings === 'object' ? ws.settings : {}) || {};
  const done = settings.onboarding ?? {};
  // workspace_created is implicitly done if the workspace exists.
  if (!done.workspace_created && ws) done.workspace_created = ws.createdAt.toISOString();
  const steps = STEPS.map((key) => ({ key, completedAt: done[key] ?? null }));
  const completed = steps.filter((s) => s.completedAt).length;
  return { steps, completed, total: STEPS.length, complete: completed === STEPS.length };
}
