/**
 * Agent run orchestration (PLAN.md §8.4, §8.5, §7.3). triggerRun creates a
 * queued run and dispatches it to the agent's computer over the /daemon
 * namespace; the daemon streams run.event/run.message/run.finished back, which
 * we persist (+ broadcast to clients) and render as agent messages.
 *
 * Phase 5 adds the multi-agent layer on top of the Phase 4 dispatch loop:
 *   - Loop safety: chain-depth cap, per-workspace hourly cap, self-trigger guard
 *     (PLAN.md §8.4). chainDepth/parentRunId are tracked per run.
 *   - Handoffs: an agent's run posting @another-agent triggers that agent's run
 *     (postAgentMessage → triggerForMentions), optionally as a subtask.
 *   - Approval gates (improvement #3): requestApproval posts an approve/deny
 *     card + parks the run; decideApproval resumes it via the daemon.
 *   - Retry: re-dispatch a finished run as a fresh attempt.
 */
import { prisma } from '../../lib/db.js';
import { NotFoundError, ConflictError, RunRefusedError } from '@atul1104/shared';
import {
  RUN_STATUS,
  RUN_EVENT_TYPE,
  RUN_TRIGGER,
  AGENT_LOOP_LIMITS,
  MESSAGE_PAYLOAD_TYPE,
} from '@atul1104/shared';
import { approvalRequestPayloadSchema } from '@atul1104/shared';
import { createMessage } from '../messages/service.js';
import { createSubtask } from '../tasks/service.js';
import { markOnboardingStep } from '../workspaces/onboarding.js';
// Phase 8+ — append the Git collaboration section to a git-enabled agent's
// system prompt at dispatch time (GIT_COLLABORATION.md §Phase 1). git/service
// doesn't import runs, so this is cycle-free.
import { composeSystemPrompt } from '../git/service.js';

// Runtime statuses a daemon may set directly via a `status` run event. Terminal
// states (succeeded/failed/cancelled) and the awaiting_approval park happen
// only through their dedicated paths (run.finished / approval_request), so a
// buggy or rogue daemon can't, e.g., flip a run to 'succeeded' to skip gates.
const DAEMON_SETTABLE_STATUSES = new Set([RUN_STATUS.RUNNING, RUN_STATUS.DISPATCHED]);

// Lazy import to avoid a module-eval cycle (realtime daemon ns imports this).
async function rt() {
  return (await import('../../realtime/index.js')).getRealtime();
}

function serializeRun(r) {
  return {
    id: r.id,
    agentId: r.agentId,
    computerId: r.computerId,
    workspaceId: r.workspaceId,
    taskId: r.taskId,
    triggerMessageId: r.triggerMessageId,
    parentRunId: r.parentRunId,
    chainDepth: r.chainDepth,
    trigger: r.trigger,
    status: r.status,
    model: r.model,
    tokensIn: Number(r.tokensIn ?? 0),
    tokensOut: Number(r.tokensOut ?? 0),
    error: r.error,
    queuedAt: r.queuedAt,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  };
}

// ---------------------------------------------------------------------------
// Loop-safety guards (PLAN.md §8.4)
// ---------------------------------------------------------------------------
/** Runs queued in this workspace in the last hour (hourly-cap counter). */
async function recentRunCount(workspaceId) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  return prisma.agentRun.count({ where: { workspaceId, queuedAt: { gte: since } } });
}

/**
 * Resolve the chain depth for a new run from its parent (handoff) or an explicit
 * value. Direct human/schedule triggers are depth 0; each agent→agent hop adds 1.
 */
async function resolveChainDepth({ parentRunId, chainDepth }) {
  if (parentRunId) {
    const parent = await prisma.agentRun.findUnique({ where: { id: parentRunId } });
    // A vanished parent is treated as depth 0 rather than failing the run.
    return (parent?.chainDepth ?? 0) + 1;
  }
  return chainDepth ?? 0;
}

// ---------------------------------------------------------------------------
// Trigger + dispatch
// ---------------------------------------------------------------------------
/** Statuses that count as "actively running" for the one-run-per-agent rule. */
const ACTIVE_RUN_STATUSES = [
  RUN_STATUS.DISPATCHED,
  RUN_STATUS.RUNNING,
  RUN_STATUS.AWAITING_APPROVAL,
];

/** Assemble the dispatch context (PLAN.md §7.3) from a persisted run. */
async function buildDispatchContext(run, agent, contextText) {
  const triggerMsg = run.triggerMessageId
    ? await prisma.message.findUnique({ where: { id: run.triggerMessageId } })
    : null;
  const task = run.taskId ? await prisma.task.findUnique({ where: { id: run.taskId } }) : null;
  return {
    runId: run.id,
    agent: {
      id: agent.id,
      handle: agent.handle,
      // Phase 8+ — base prompt + the Git section (empty when no repo configured).
      systemPrompt: composeSystemPrompt(agent),
      runtime: agent.runtime,
      model: agent.model,
      approvalPolicy: agent.approvalPolicy,
    },
    context: {
      channel: triggerMsg?.channelId ?? null,
      trigger: contextText ?? triggerMsg?.content ?? '',
      threadRootId: triggerMsg?.threadRootId ?? triggerMsg?.id ?? null,
      task: task
        ? { id: task.id, title: task.title, description: task.description, status: task.status }
        : null,
      chainDepth: run.chainDepth,
      parentRunId: run.parentRunId ?? null,
    },
  };
}

/** Flip a QUEUED run to DISPATCHED, mark the agent running, and dispatch it.
 *  Shared by the trigger path, the finish-drain, and the daemon-reconnect path. */
async function dispatchPersistedRun(run, agent, contextText) {
  await prisma.agent.update({ where: { id: agent.id }, data: { status: 'running' } });
  await prisma.agentRun.update({
    where: { id: run.id },
    data: { status: RUN_STATUS.DISPATCHED, startedAt: new Date() },
  });
  const context = await buildDispatchContext(run, agent, contextText);
  (await rt())?.dispatchRun(agent.computerId, context);
  (await rt())?.broadcastRunLifecycle(
    run.workspaceId,
    serializeRun({ ...run, status: RUN_STATUS.DISPATCHED, startedAt: new Date() }),
    'started',
  );
}

/**
 * Trigger a run for an agent. If the agent's computer is online AND it has no
 * run in flight, dispatch immediately; otherwise leave the run QUEUED (drained
 * when the active run finishes, or when the daemon reconnects).
 *
 * Loop safety (PLAN.md §8.4): refuses (RunRefusedError) when the chain depth
 * exceeds MAX_CHAIN_DEPTH or the workspace hourly cap is hit. The self-trigger
 * guard is enforced by triggerForMentions (it skips the sending agent); we also
 * refuse here if a parent run is from the same agent (defence in depth).
 */
export async function triggerRun({
  workspaceId,
  agentId,
  triggerMessageId,
  taskId,
  contextText,
  parentRunId = null,
  chainDepth,
  trigger = RUN_TRIGGER.MENTION,
}) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { actor: true, computer: true },
  });
  if (!agent || agent.workspaceId !== workspaceId) throw new NotFoundError('Agent not found');

  const depth = await resolveChainDepth({ parentRunId, chainDepth });

  // Self-trigger guard (defence in depth): an agent never spawns its own run.
  if (parentRunId) {
    const parent = await prisma.agentRun.findUnique({ where: { id: parentRunId } });
    if (parent && parent.agentId === agent.id) {
      throw new RunRefusedError('Agent cannot trigger itself', 'self_trigger');
    }
  }
  if (depth > AGENT_LOOP_LIMITS.MAX_CHAIN_DEPTH) {
    throw new RunRefusedError(
      `Agent chain depth ${depth} exceeds cap of ${AGENT_LOOP_LIMITS.MAX_CHAIN_DEPTH}`,
      'chain_depth',
    );
  }
  const recent = await recentRunCount(workspaceId);
  if (recent >= AGENT_LOOP_LIMITS.RUNS_PER_HOUR_PER_WORKSPACE) {
    throw new RunRefusedError('Workspace hourly run cap reached', 'hourly_cap');
  }

  const run = await prisma.agentRun.create({
    data: {
      agentId: agent.id,
      computerId: agent.computerId,
      workspaceId,
      taskId: taskId ?? null,
      triggerMessageId: triggerMessageId ?? null,
      parentRunId: parentRunId ?? null,
      chainDepth: depth,
      trigger,
      status: RUN_STATUS.QUEUED,
      model: agent.model,
    },
  });

  const triggerMsg = triggerMessageId
    ? await prisma.message.findUnique({ where: { id: triggerMessageId } })
    : null;
  const channelId = triggerMsg?.channelId ?? null;

  // No computer / offline → note + stay queued (picked up on reconnect).
  if (!agent.computerId || agent.computer.status !== 'online') {
    if (channelId && agent.actor) {
      const note = await createMessage({
        channelId,
        senderId: agent.actor.id,
        content: `🖥️ My computer is offline. Run queued — start the daemon and I'll pick it up.`,
        payload: { type: MESSAGE_PAYLOAD_TYPE.RUN_OFFLINE, runId: run.id },
      });
      (await rt())?.broadcastMessage(workspaceId, channelId, note.message, []);
    }
    return serializeRun(run);
  }

  // One run per agent at a time (PLAN.md §8.4): queue extras server-side. The
  // just-created run is QUEUED so it isn't counted; if another is active we leave
  // this queued for finishRun/reconnect to drain.
  const active = await prisma.agentRun.count({
    where: { agentId: agent.id, status: { in: ACTIVE_RUN_STATUSES } },
  });
  if (active === 0) await dispatchPersistedRun(run, agent, contextText);

  return serializeRun(await prisma.agentRun.findUnique({ where: { id: run.id } }));
}

/** Re-dispatch QUEUED runs for a computer (called when its daemon connects). */
export async function dispatchQueuedForComputer(computerId) {
  const computer = await prisma.computer.findUnique({ where: { id: computerId } });
  if (!computer || computer.status !== 'online') return;
  const queued = await prisma.agentRun.findMany({
    where: { computerId, status: RUN_STATUS.QUEUED },
    orderBy: { queuedAt: 'asc' },
  });
  for (const run of queued) {
    const agent = await prisma.agent.findUnique({
      where: { id: run.agentId },
      include: { actor: true, computer: true },
    });
    if (!agent) continue;
    const active = await prisma.agentRun.count({
      where: { agentId: agent.id, status: { in: ACTIVE_RUN_STATUSES } },
    });
    if (active === 0) await dispatchPersistedRun(run, agent);
  }
}

/** Persist a streamed run event (deduped on runId+seq) + broadcast to clients.
 *  An `approval_request` event also creates the approval card + parks the run. */
export async function ingestEvent(runId, seq, type, payload) {
  const run = await prisma.agentRun.findUnique({ where: { id: runId } });
  if (!run) return;
  try {
    await prisma.runEvent.create({ data: { runId, seq, type, payload } });
  } catch {
    return; // unique (runId,seq) collision → duplicate replay, ignore
  }
  if (type === RUN_EVENT_TYPE.STATUS && DAEMON_SETTABLE_STATUSES.has(payload?.status)) {
    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: payload.status },
    });
  }
  if (type === RUN_EVENT_TYPE.APPROVAL_REQUEST) {
    // Validate the request shape before turning it into a card (guards against
    // a buggy daemon shipping huge/secret-laden labels). Park + post the card.
    const parsed = approvalRequestPayloadSchema.safeParse(payload);
    if (parsed.success) await requestApproval(runId, parsed.data).catch(() => {});
  }
  (await rt())?.broadcastRunEvent(run.workspaceId, { runId, seq, type, payload });
}

/** The daemon posts an agent-authored message into the trigger thread. Falls
 *  back to the workspace's #general when there's no trigger message (test runs).
 *  Phase 5: @mentions of OTHER agents in this message trigger handoff runs. */
export async function postAgentMessage(runId, content, payload) {
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    include: { agent: { include: { actor: true } } },
  });
  if (!run || !run.agent.actor) return;
  const trigger = run.triggerMessageId
    ? await prisma.message.findUnique({ where: { id: run.triggerMessageId } })
    : null;
  let channelId = trigger?.channelId;
  if (!channelId) {
    const general = await prisma.channel.findFirst({
      where: { workspaceId: run.workspaceId, name: 'general' },
    });
    channelId = general?.id;
  }
  if (!channelId) return;
  // Where does the reply land?
  //  - If the trigger is itself a thread reply (threadRootId set), reply in that
  //    thread — keeps a threaded conversation threaded.
  //  - If the trigger is an agent→agent handoff (parentRunId set), thread under
  //    the trigger so the handoff is traceable but doesn't spam the channel.
  //  - If a human @mentioned an agent in a top-level message, reply INLINE in the
  //    channel (not a thread) so the answer is visible without clicking in.
  const threadRootId = trigger?.threadRootId ?? (run.parentRunId ? trigger?.id : null) ?? null;
  const { message, mentionedActorIds } = await createMessage({
    channelId,
    senderId: run.agent.actor.id,
    content,
    threadRootId,
    payload: { ...(payload ?? {}), runId },
  });
  (await rt())?.broadcastMessage(run.workspaceId, channelId, message, mentionedActorIds);

  // Handoff magic (PLAN.md §8.4): an agent mentioning another agent triggers a
  // chained run, skipping itself. Propagate the task so the handoff binds to it.
  if (mentionedActorIds.length) {
    await triggerForMentions(run.workspaceId, message.id, mentionedActorIds, content, {
      parentRunId: runId,
      excludeActorId: run.agent.actor.id,
      taskId: run.taskId,
      trigger: RUN_TRIGGER.HANDOFF,
    }).catch(() => {});
  }
}

/** Trigger runs for mentioned agents. Phase 5 opts:
 *  - excludeActorId: never let an agent trigger itself (sender of the message).
 *  - parentRunId: this mention came from an agent run → a handoff (chain +1).
 *  - taskId: bind the triggered run to the task; if the parent had a task,
 *    create a subtask assigned to the mentioned agent (the §8.4 subtask magic). */
export async function triggerForMentions(
  workspaceId,
  messageId,
  mentionedActorIds,
  contextText,
  { parentRunId = null, excludeActorId = null, taskId = null, trigger = RUN_TRIGGER.MENTION } = {},
) {
  if (!mentionedActorIds?.length) return [];
  const agents = await prisma.agent.findMany({
    where: { actorId: { in: mentionedActorIds }, workspaceId },
  });
  // Resolve the parent task once (for subtask creation on handoffs).
  const parentTask = taskId ? await prisma.task.findUnique({ where: { id: taskId } }) : null;
  // The originating agent (whose run posted the handoff) authors any blocked
  // note — not the blocked target, which never ran.
  const parentRun = parentRunId
    ? await prisma.agentRun.findUnique({
        where: { id: parentRunId },
        include: { agent: { include: { actor: true } } },
      })
    : null;
  const originActorId = parentRun?.agent?.actor?.id ?? null;

  const runs = [];
  for (const a of agents) {
    if (excludeActorId && a.actorId === excludeActorId) continue; // self-trigger guard
    try {
      let runTaskId = taskId;
      // Handoff subtask: child task under the parent, assigned to the recipient.
      if (parentRunId && parentTask) {
        const sub = await createSubtask({
          workspaceId,
          parentId: parentTask.id,
          channelId: parentTask.channelId,
          title: `Handoff → @${a.handle}`,
          assigneeActorId: a.actorId,
          rootMessageId: messageId,
        });
        runTaskId = sub.id;
      }
      runs.push(
        await triggerRun({
          workspaceId,
          agentId: a.id,
          triggerMessageId: messageId,
          taskId: runTaskId,
          contextText,
          parentRunId,
          trigger,
        }),
      );
    } catch (err) {
      // A refused handoff is reported in-thread, not fatal to the message send.
      if (err instanceof RunRefusedError && parentRunId) {
        await noteBlockedHandoff(workspaceId, messageId, a, err, originActorId).catch(() => {});
      }
      runs.push({ error: err.message, agentId: a.id, reason: err.details?.reason });
    }
  }
  return runs;
}

async function noteBlockedHandoff(workspaceId, messageId, agent, err, originActorId) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg) return;
  // Posted by the originating agent when known; fall back to the system-style
  // note from the blocked target only as a last resort.
  const senderId = originActorId ?? msg.senderId;
  if (!senderId) return;
  const note = await createMessage({
    channelId: msg.channelId,
    senderId,
    content: `🛑 Couldn't hand off to @${agent.handle}: ${err.message}`,
    // Sibling of the handoff attempt (same thread, or top-level alongside it).
    threadRootId: msg.threadRootId ?? null,
    payload: { type: MESSAGE_PAYLOAD_TYPE.RUN_OFFLINE, blocked: true, reason: err.details?.reason },
  });
  (await rt())?.broadcastMessage(workspaceId, msg.channelId, note.message, []);
}

// ---------------------------------------------------------------------------
// Approval gates (improvement #3)
// ---------------------------------------------------------------------------
/** Create an approval card in the run's thread + park the run awaiting a human. */
export async function requestApproval(runId, { action, label, risk = 'medium' }) {
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    include: { agent: { include: { actor: true } } },
  });
  if (!run || !run.agent.actor) return null;

  const trigger = run.triggerMessageId
    ? await prisma.message.findUnique({ where: { id: run.triggerMessageId } })
    : null;
  let channelId = trigger?.channelId;
  if (!channelId) {
    const general = await prisma.channel.findFirst({
      where: { workspaceId: run.workspaceId, name: 'general' },
    });
    channelId = general?.id;
  }

  const approval = await prisma.approval.create({
    data: {
      runId: run.id,
      requestedAction: { action, label, risk },
    },
  });

  // The approve/deny card lives in the same thread as the run.
  let cardMessageId = null;
  if (channelId) {
    const card = await createMessage({
      channelId,
      senderId: run.agent.actor.id,
      content: `🔐 Needs your approval before I **${action}**${label ? `: ${label}` : ''}.`,
      threadRootId: trigger?.threadRootId ?? trigger?.id ?? null,
      payload: {
        type: MESSAGE_PAYLOAD_TYPE.APPROVAL,
        approvalId: approval.id,
        runId: run.id,
        status: 'pending',
        action,
        label,
        risk,
      },
    });
    cardMessageId = card.message.id;
    (await rt())?.broadcastMessage(run.workspaceId, channelId, card.message, []);
    await prisma.approval.update({
      where: { id: approval.id },
      data: { messageId: cardMessageId },
    });
  }

  await prisma.agentRun.update({
    where: { id: run.id },
    data: { status: RUN_STATUS.AWAITING_APPROVAL },
  });
  (await rt())?.broadcastApproval(
    run.workspaceId,
    { ...approval, messageId: cardMessageId },
    'requested',
  );
  // Phase 6 — notify + push the human members who can approve (PLAN.md "done when").
  (await import('../notifications/service.js'))
    .notifyApprovalRequested({
      workspaceId: run.workspaceId,
      approvalId: approval.id,
      runId: run.id,
      agentHandle: run.agent.handle,
      action,
      label,
    })
    .catch(() => {});
  return approval;
}

/** Record a human's decision, flip the card, and tell the daemon to resume. */
export async function decideApproval(approvalId, decision, decidedBy) {
  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    include: { run: { include: { agent: { include: { computer: true } } } } },
  });
  if (!approval) throw new NotFoundError('Approval not found');
  if (approval.decision) throw new ConflictError('Approval already decided');

  // Atomically claim the decision (WHERE decision IS NULL) so two concurrent
  // deciders can't both win — the loser updates 0 rows.
  const claimed = await prisma.approval.updateMany({
    where: { id: approvalId, decision: null },
    data: { decision, decidedBy, decidedAt: new Date() },
  });
  if (claimed.count === 0) throw new ConflictError('Approval already decided');
  const updated = await prisma.approval.findUnique({ where: { id: approvalId } });

  // Flip the card payload to reflect the decision.
  if (approval.messageId) {
    const card = await prisma.message.findUnique({ where: { id: approval.messageId } });
    if (card?.payload) {
      await prisma.message.update({
        where: { id: card.id },
        data: { payload: { ...card.payload, status: decision } },
      });
      (await rt())?.broadcastMessageUpdate(approval.run.workspaceId, card.channelId, {
        ...card,
        payload: { ...card.payload, status: decision },
      });
    }
  }

  // Only a genuinely-parked run is resumed. A decision on a run that was since
  // cancelled/finished (its open approvals were voided → claimed.count 0 above)
  // never reaches here, but we guard regardless so a stale card can't resurrect
  // a finished run.
  if (approval.run.status === RUN_STATUS.AWAITING_APPROVAL) {
    await prisma.agentRun.update({
      where: { id: approval.run.id },
      data: { status: RUN_STATUS.RUNNING },
    });
    // Notify the daemon so the adapter's requestApproval() promise resolves.
    const computerId = approval.run.agent?.computerId;
    if (computerId) {
      (await rt())?.sendApprovalDecision(computerId, approval.run.id, approvalId, decision);
    }
  }
  (await rt())?.broadcastApproval(approval.run.workspaceId, updated, 'decided');
  return updated;
}

/**
 * Void a run's still-open approvals (decision IS NULL): mark them denied and
 * flip their cards to 'cancelled' so they stop being actionable. Called when a
 * run leaves the awaiting state via cancel/finish so a stale card can't later
 * resurrect or re-notify the run.
 */
async function voidOpenApprovals(run) {
  const open = await prisma.approval.findMany({
    where: { runId: run.id, decision: null },
  });
  if (!open.length) return;
  await prisma.approval.updateMany({
    where: { runId: run.id, decision: null },
    data: { decision: 'denied', decidedAt: new Date() },
  });
  for (const a of open) {
    if (!a.messageId) continue;
    const card = await prisma.message.findUnique({ where: { id: a.messageId } });
    if (card?.payload) {
      await prisma.message.update({
        where: { id: card.id },
        data: { payload: { ...card.payload, status: 'cancelled' } },
      });
      (await rt())?.broadcastMessageUpdate(run.workspaceId, card.channelId, {
        ...card,
        payload: { ...card.payload, status: 'cancelled' },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Finish / read / cancel / retry
// ---------------------------------------------------------------------------
export async function finishRun(runId, status, usage, error) {
  const run = await prisma.agentRun.findUnique({ where: { id: runId }, include: { agent: true } });
  if (!run) return;
  const tokensIn = Number(usage?.tokensIn ?? 0);
  const tokensOut = Number(usage?.tokensOut ?? 0);
  const costCents = usage
    ? (await import('@atul1104/shared')).estimateCostCents(run.model, tokensIn, tokensOut)
    : undefined;
  const updated = await prisma.agentRun.update({
    where: { id: runId },
    data: {
      status,
      finishedAt: new Date(),
      error: error ?? null,
      ...(usage
        ? {
            tokensIn: BigInt(tokensIn),
            tokensOut: BigInt(tokensOut),
            costEstimateCents: costCents,
          }
        : {}),
    },
  });
  await prisma.agent.update({ where: { id: run.agentId }, data: { status: 'idle' } });
  await voidOpenApprovals(run).catch(() => {});
  (await rt())?.broadcastRunLifecycle(run.workspaceId, serializeRun(updated), 'finished');
  // Phase 6 — notify + push the user who triggered the run (if it was a human).
  if (run.triggerMessageId) {
    const trigger = await prisma.message.findUnique({
      where: { id: run.triggerMessageId },
      include: { sender: true },
    });
    if (trigger?.sender?.kind === 'user' && trigger.sender.userId) {
      (await import('../notifications/service.js'))
        .notifyRunFinished({
          workspaceId: run.workspaceId,
          runId: run.id,
          userId: trigger.sender.userId,
          agentHandle: run.agent.handle,
          status,
        })
        .catch(() => {});
    }
  }
  // Drain: dispatch this agent's next queued run now that a slot freed up.
  await drainQueuedForAgent(run.agentId).catch(() => {});
  // Phase 8 — onboarding funnel.
  await markOnboardingStep(run.workspaceId, 'first_run').catch(() => {});
  return serializeRun(updated);
}

/** Dispatch the oldest QUEUED run for an agent (one-run-per-agent drain). */
async function drainQueuedForAgent(agentId) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { actor: true, computer: true },
  });
  if (!agent?.computerId || agent.computer.status !== 'online') return;
  const next = await prisma.agentRun.findFirst({
    where: { agentId, status: RUN_STATUS.QUEUED },
    orderBy: { queuedAt: 'asc' },
  });
  if (!next) return;
  const active = await prisma.agentRun.count({
    where: { agentId, status: { in: ACTIVE_RUN_STATUSES } },
  });
  if (active === 0) await dispatchPersistedRun(next, agent);
}

export async function getRun(workspaceId, runId) {
  const run = await prisma.agentRun.findUnique({ where: { id: runId } });
  if (!run || run.workspaceId !== workspaceId) throw new NotFoundError('Run not found');
  return serializeRun(run);
}

export async function listRuns(workspaceId, agentId) {
  const runs = await prisma.agentRun.findMany({
    where: { workspaceId, ...(agentId ? { agentId } : {}) },
    orderBy: { queuedAt: 'desc' },
    take: 50,
    include: { agent: { select: { id: true, name: true, handle: true } } },
  });
  return runs.map((r) => ({ ...serializeRun(r), agent: r.agent }));
}

export async function cancelRun(workspaceId, runId) {
  const run = await prisma.agentRun.findUnique({ where: { id: runId } });
  if (!run || run.workspaceId !== workspaceId) throw new NotFoundError('Run not found');
  if ([RUN_STATUS.SUCCEEDED, RUN_STATUS.FAILED, RUN_STATUS.CANCELLED].includes(run.status)) {
    throw new ConflictError('Run already finished');
  }
  const agent = await prisma.agent.findUnique({ where: { id: run.agentId } });
  if (agent?.computerId) (await rt())?.cancelRun(agent.computerId, runId);
  return finishRun(runId, RUN_STATUS.CANCELLED, undefined, 'Cancelled by user');
}

/** Re-dispatch a finished run as a fresh attempt (resets chain depth). */
export async function retryRun(workspaceId, runId) {
  const run = await prisma.agentRun.findUnique({ where: { id: runId } });
  if (!run || run.workspaceId !== workspaceId) throw new NotFoundError('Run not found');
  if (![RUN_STATUS.SUCCEEDED, RUN_STATUS.FAILED, RUN_STATUS.CANCELLED].includes(run.status)) {
    throw new ConflictError('Only finished runs can be retried');
  }
  return triggerRun({
    workspaceId,
    agentId: run.agentId,
    triggerMessageId: run.triggerMessageId,
    taskId: run.taskId,
    trigger: RUN_TRIGGER.RETRY,
  });
}

export { serializeRun };
