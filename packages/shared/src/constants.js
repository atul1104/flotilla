/**
 * Cross-package constants. Single source of truth for roles, statuses, plan
 * limits, and socket event names (PLAN.md §6, §7.2, §7.3).
 *
 * Plan limits live here (not in code branches) so flipping a workspace to Pro
 * is a data change, not a code change (PLAN.md §6).
 */

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
export const PLANS = {
  FREE: 'free',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
};

export const PLAN_PRICING = {
  // shape only; Stripe wiring is Phase 7 (PLAN.md §12)
  [PLANS.FREE]: { priceMonthly: 0, priceAnnualMonthly: 0 },
  [PLANS.PRO]: { priceMonthly: 8.8, priceAnnualMonthly: 7.04 }, // 12% off annual
  [PLANS.ENTERPRISE]: { priceMonthly: null },
};

/**
 * Per-plan limits. Values referenced everywhere limits are enforced.
 * `seats = humans * 1 + agents * 0.1` (computed nightly in Phase 7).
 */
export const PLAN_LIMITS = {
  [PLANS.FREE]: {
    maxAgents: 3,
    messageHistoryDays: 30, // gated on read, data retained
    uploadsBytesPerMonth: 100 * 1024 * 1024, // 100 MB
    jointChannels: false,
  },
  [PLANS.PRO]: {
    maxAgents: Infinity,
    messageHistoryDays: Infinity,
    uploadsBytesPerMonth: 10 * 1024 * 1024 * 1024, // 10 GB
    jointChannels: true,
  },
  [PLANS.ENTERPRISE]: {
    maxAgents: Infinity,
    messageHistoryDays: Infinity,
    uploadsBytesPerMonth: Infinity,
    jointChannels: true,
  },
};

// ---------------------------------------------------------------------------
// Actors, members, roles
// ---------------------------------------------------------------------------
export const ACTOR_KIND = {
  USER: 'user',
  AGENT: 'agent',
};

export const WORKSPACE_ROLE = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  AGENT: 'agent',
};

export const ROLE_RANK = {
  [WORKSPACE_ROLE.MEMBER]: 0,
  [WORKSPACE_ROLE.AGENT]: 1,
  [WORKSPACE_ROLE.ADMIN]: 2,
  [WORKSPACE_ROLE.OWNER]: 3,
};

// ---------------------------------------------------------------------------
// Channels & messages
// ---------------------------------------------------------------------------
export const CHANNEL_KIND = {
  PUBLIC: 'public',
  PRIVATE: 'private',
  DM: 'dm',
};

export const NOTIFY_LEVEL = {
  ALL: 'all',
  MENTIONS: 'mentions',
  NOTHING: 'nothing',
};

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export const TASK_STATUS = {
  BACKLOG: 'backlog',
  CLAIMED: 'claimed',
  RUNNING: 'running',
  NEEDS_REVIEW: 'needs_review',
  DONE: 'done',
  CANCELLED: 'cancelled',
};

/** Board columns in display order (improvement #1 — Kanban view). */
export const TASK_BOARD_COLUMNS = [
  TASK_STATUS.BACKLOG,
  TASK_STATUS.CLAIMED,
  TASK_STATUS.RUNNING,
  TASK_STATUS.NEEDS_REVIEW,
  TASK_STATUS.DONE,
];

// ---------------------------------------------------------------------------
// Agents & runs
// ---------------------------------------------------------------------------
export const AGENT_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  OFFLINE: 'offline',
};

export const RUNTIME = {
  CLAUDE_CODE: 'claude-code',
};

export const COMPUTER_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
};

export const RUN_STATUS = {
  QUEUED: 'queued',
  DISPATCHED: 'dispatched',
  RUNNING: 'running',
  AWAITING_APPROVAL: 'awaiting_approval',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

export const RUN_EVENT_TYPE = {
  STATUS: 'status',
  THINKING: 'thinking',
  TOOL_USE: 'tool_use',
  TOOL_RESULT: 'tool_result',
  APPROVAL_REQUEST: 'approval_request',
  CHUNK: 'chunk',
  FINAL: 'final',
};

export const APPROVAL_DECISION = {
  APPROVED: 'approved',
  DENIED: 'denied',
};

/**
 * What initiated a run (PLAN.md §8.4). Recorded on `agent_runs.trigger` and
 * surfaced in the live-activity UI. `handoff` = another agent's run triggered it.
 */
export const RUN_TRIGGER = {
  MENTION: 'mention',
  TASK: 'task',
  DM: 'dm',
  HANDOFF: 'handoff',
  TEST: 'test',
  RETRY: 'retry',
  SCHEDULE: 'schedule', // Phase 6 cron
};

/**
 * Structured `messages.payload` card types. `task_card` (Phase 3) +
 * `run_offline` (Phase 4) are joined by the approval + artifact + handoff cards
 * in Phase 5. The web client switches on `payload.type` to render a card.
 */
export const MESSAGE_PAYLOAD_TYPE = {
  TASK_CARD: 'task_card',
  RUN_OFFLINE: 'run_offline',
  APPROVAL: 'approval',
  ARTIFACT: 'artifact',
  HANDOFF: 'run_handoff',
};

/**
 * Artifact kinds rendered by the ArtifactViewer (improvement #6). `diff` is a
 * unified diff; `code` is a fenced snippet; `markdown` renders rich text;
 * `image` is an attachment/URL preview.
 */
export const ARTIFACT_TYPE = {
  DIFF: 'diff',
  CODE: 'code',
  MARKDOWN: 'markdown',
  IMAGE: 'image',
};

/**
 * Approval-policy keys (improvement #3). Stored on `agents.approval_policy`
 * (jsonb). A missing key defaults to the value in DEFAULT_APPROVAL_POLICY.
 * `outsideWorkspace` applies to file writes outside the agent workspace dir.
 */
export const APPROVAL_POLICY_KEYS = {
  SHELL: 'requireShellApproval',
  FILE_WRITE: 'requireFileWriteApproval',
  OUTSIDE_WORKSPACE: 'requireApprovalOutsideWorkspace',
  ALL_TOOLS: 'requireApprovalForAllTools',
};

export const DEFAULT_APPROVAL_POLICY = {
  [APPROVAL_POLICY_KEYS.SHELL]: false,
  [APPROVAL_POLICY_KEYS.FILE_WRITE]: false,
  [APPROVAL_POLICY_KEYS.OUTSIDE_WORKSPACE]: true,
  [APPROVAL_POLICY_KEYS.ALL_TOOLS]: false,
};

// ---------------------------------------------------------------------------
// Agent loop-safety caps (PLAN.md §8.4)
// ---------------------------------------------------------------------------
export const AGENT_LOOP_LIMITS = {
  MAX_CHAIN_DEPTH: 5, // agent→agent trigger depth
  RUNS_PER_HOUR_PER_WORKSPACE: 200,
  MAX_CONCURRENT_RUNS_PER_DAEMON: 2, // one run per agent; queue extras server-side
};

// ---------------------------------------------------------------------------
// Socket.IO event names
// ---------------------------------------------------------------------------
/**
 * `/client` namespace (browsers). PLAN.md §7.2.
 */
export const CLIENT_SOCKET_EVENTS = {
  // server -> client
  MESSAGE_CREATED: 'message.created',
  MESSAGE_UPDATED: 'message.updated',
  MESSAGE_DELETED: 'message.deleted',
  REACTION_ADDED: 'reaction.added',
  REACTION_REMOVED: 'reaction.removed',
  CHANNEL_CREATED: 'channel.created',
  CHANNEL_UPDATED: 'channel.updated',
  MEMBER_JOINED: 'member.joined',
  MEMBER_LEFT: 'member.left',
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  RUN_STARTED: 'run.started',
  RUN_EVENT: 'run.event',
  RUN_FINISHED: 'run.finished',
  AGENT_STATUS: 'agent.status',
  COMPUTER_STATUS: 'computer.status',
  APPROVAL_REQUESTED: 'approval.requested',
  APPROVAL_DECIDED: 'approval.decided',
  NOTIFICATION_CREATED: 'notification.created',
  TYPING: 'typing',
  // client -> server
  TYPING_START: 'typing.start',
  CHANNEL_READ: 'channel.read',
};

/**
 * `/daemon` namespace (computers). PLAN.md §7.3.
 */
export const DAEMON_SOCKET_EVENTS = {
  // server -> daemon
  RUN_DISPATCH: 'run.dispatch',
  RUN_CANCEL: 'run.cancel',
  APPROVAL_DECISION: 'approval.decision',
  AGENT_SYNC: 'agent.sync',
  // daemon -> server
  RUN_EVENT: 'run.event',
  RUN_MESSAGE: 'run.message',
  RUN_FINISHED: 'run.finished',
  AGENT_REGISTER: 'agent.register',
  COMPUTER_INFO: 'computer.info',
};

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------
export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 200,
};

export const HEARTBEAT = {
  INTERVAL_MS: 20_000, // daemon heartbeat
  MISSED_THRESHOLD: 2, // missed 2 -> offline
};

export const DEFAULTS = {
  AGENT_MODEL: 'claude-sonnet-5',
  AGENT_RUNTIME: RUNTIME.CLAUDE_CODE,
};

// ---------------------------------------------------------------------------
// Phase 6 — notifications, observability, scheduling, team templates
// ---------------------------------------------------------------------------
/** Notification kinds (notifications.type). */
export const NOTIFICATION_TYPE = {
  MENTION: 'mention',
  APPROVAL: 'approval',
  RUN_FINISHED: 'run_finished',
  TASK_ASSIGNED: 'task_assigned',
  HANDOFF: 'handoff',
};

/**
 * Cost estimation (improvement #2 — usage & cost dashboard). USD per 1M tokens,
 * by model. Unknown models fall back to the `_default` rate. Used to populate
 * agent_runs.cost_estimate_cents + roll up on the usage dashboard. Rates are
 * approximate public list prices; swap for real provisioning costs in prod.
 */
export const MODEL_COST_PER_MTOK = {
  _default: { in: 3.0, out: 15.0 },
  'claude-sonnet-5': { in: 3.0, out: 15.0 },
  'claude-opus-4-8': { in: 15.0, out: 75.0 },
  'claude-haiku-4-5-20251001': { in: 0.8, out: 4.0 },
  'claude-fable-5': { in: 6.0, out: 30.0 },
  'gpt-4o': { in: 2.5, out: 10.0 },
};

/** Estimate a run's cost in cents from tokens + model. */
export function estimateCostCents(model, tokensIn, tokensOut) {
  const rate = MODEL_COST_PER_MTOK[model] || MODEL_COST_PER_MTOK._default;
  const dollars =
    (Number(tokensIn || 0) / 1_000_000) * rate.in + (Number(tokensOut || 0) / 1_000_000) * rate.out;
  return Math.round(dollars * 100);
}

/** Usage dashboard default window (PLAN.md §2 #2). */
export const USAGE = {
  DEFAULT_WINDOW_DAYS: 30,
  MAX_WINDOW_DAYS: 365,
};

/**
 * Agent team templates (improvement #5). One-click blueprints that create a set
 * of pre-configured agents. `handle` must be unique per workspace; the router
 * resolves conflicts by suffixing. (PLAN.md §2 #5, §15.)
 */
export const AGENT_TEAM_TEMPLATES = {
  research: {
    id: 'research',
    name: 'Research team',
    description: 'A single deep-research agent that summarizes and cites sources.',
    agents: [
      {
        name: 'Researcher',
        handle: 'researcher',
        tagline: 'Investigates, summarizes, cites sources',
        systemPrompt:
          'You are a meticulous research agent. Investigate the topic, summarize findings concisely, and cite sources.',
        runtime: RUNTIME.CLAUDE_CODE,
      },
    ],
  },
  dev: {
    id: 'dev',
    name: 'Dev team: coder + reviewer + QA',
    description: 'Coder writes, reviewer audits, QA tests — handing work between them.',
    agents: [
      {
        name: 'Coder',
        handle: 'coder',
        tagline: 'Implements features',
        systemPrompt:
          'You are a coder. Write clean, minimal diffs. Hand off to @reviewer when the change is ready.',
        runtime: RUNTIME.CLAUDE_CODE,
      },
      {
        name: 'Reviewer',
        handle: 'reviewer',
        tagline: 'Reviews diffs, requests approval before risky actions',
        systemPrompt:
          'You are a code reviewer. Audit diffs for correctness + security. Request human approval before running tests or merging.',
        runtime: RUNTIME.CLAUDE_CODE,
      },
      {
        name: 'QA',
        handle: 'qa',
        tagline: 'Writes + runs tests',
        systemPrompt: 'You are QA. Write tests for the change and report results.',
        runtime: RUNTIME.CLAUDE_CODE,
      },
    ],
  },
  support: {
    id: 'support',
    name: 'Support team: triager + responder',
    description: 'Triages incoming issues, drafts replies.',
    agents: [
      {
        name: 'Triager',
        handle: 'triager',
        tagline: 'Sorts + labels incoming issues',
        systemPrompt: 'You triage incoming issues: classify, label, and hand to @responder.',
        runtime: RUNTIME.CLAUDE_CODE,
      },
      {
        name: 'Responder',
        handle: 'responder',
        tagline: 'Drafts customer replies',
        systemPrompt: 'You draft clear, empathetic customer replies.',
        runtime: RUNTIME.CLAUDE_CODE,
      },
    ],
  },
};
