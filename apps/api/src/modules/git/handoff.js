/**
 * Smart handoff protocol (GIT_COLLABORATION.md §Phase 4). When an agent records
 * a successful Git operation that signals a workflow transition, trigger the
 * next agent in the chain — e.g. @coder opens a PR → @qa tests it.
 *
 * Best-effort + fire-and-forget: if the next agent doesn't exist in the
 * workspace, nothing happens. Mirrors tasks/router.maybeTriggerAgentAssignee.
 */
import { prisma } from '../../lib/db.js';
import * as runs from '../runs/service.js';
import { GIT_OPERATION, GIT_OPERATION_STATUS, RUN_TRIGGER } from '@atul1104/shared';

/** Operation → handle of the agent that should pick up next. */
const HANDOFF_CHAIN = {
  [GIT_OPERATION.PR]: 'qa', // PR opened → QA pulls + tests
  [GIT_OPERATION.MERGE]: 'reviewer', // merged → reviewer finalizes
};

export async function maybeTriggerGitHandoff(workspaceId, task, op) {
  if (op.status !== GIT_OPERATION_STATUS.SUCCESS) return null;
  const nextHandle = HANDOFF_CHAIN[op.operation];
  if (!nextHandle) return null;

  const next = await prisma.agent.findFirst({ where: { workspaceId, handle: nextHandle } });
  if (!next) return null; // no such agent in this workspace — nothing to hand to

  const pr = op.metadata?.pullRequestUrl || task.pullRequestUrl || null;
  const branch = op.branch || task.featureBranch || 'the feature branch';
  const contextText =
    op.operation === GIT_OPERATION.PR
      ? `@coder opened a PR${pr ? ` (${pr})` : ''} on \`${branch}\` for "${task.title}". Pull the branch, review + run the tests, then report results and tag @reviewer.`
      : `The branch for "${task.title}" was merged. Review + confirm the task is complete.`;

  return runs
    .triggerRun({
      workspaceId,
      agentId: next.id,
      taskId: task.id,
      triggerMessageId: task.rootMessageId ?? null,
      contextText,
      trigger: RUN_TRIGGER.HANDOFF,
    })
    .catch(() => null);
}
