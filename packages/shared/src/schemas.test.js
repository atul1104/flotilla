import { describe, it, expect } from 'vitest';
import {
  signupSchema,
  createWorkspaceSchema,
  createChannelSchema,
  createMessageSchema,
  handleSchema,
  paginationSchema,
  approvalPolicySchema,
  decideApprovalSchema,
  artifactPayloadSchema,
  pushSubscribeSchema,
  scheduleSchema,
  agentTeamSchema,
  toAppError,
  AppError,
  ValidationError,
} from './index.js';
import {
  PLAN_LIMITS,
  PLANS,
  TASK_BOARD_COLUMNS,
  AGENT_LOOP_LIMITS,
  APPROVAL_POLICY_KEYS,
  ARTIFACT_TYPE,
  MESSAGE_PAYLOAD_TYPE,
  estimateCostCents,
} from './constants.js';
import { parseCron, cronDue, cronMatches } from './cron.js';

describe('constants', () => {
  it('free plan enforces the documented limits', () => {
    const free = PLAN_LIMITS[PLANS.FREE];
    expect(free.maxAgents).toBe(3);
    expect(free.messageHistoryDays).toBe(30);
    expect(free.uploadsBytesPerMonth).toBe(100 * 1024 * 1024);
  });

  it('board columns are in display order', () => {
    expect(TASK_BOARD_COLUMNS).toEqual(['backlog', 'claimed', 'running', 'needs_review', 'done']);
  });
});

describe('auth schemas', () => {
  it('rejects short passwords (<12)', () => {
    const r = signupSchema.safeParse({ email: 'a@b.co', name: 'A', password: 'short' });
    expect(r.success).toBe(false);
  });

  it('lowercases and validates email', () => {
    const r = signupSchema.safeParse({
      email: 'A@B.CO',
      name: 'A',
      password: 'twelve-chars!',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('a@b.co');
  });
});

describe('workspace schemas', () => {
  it('accepts a valid slug', () => {
    expect(createWorkspaceSchema.safeParse({ name: 'Acme', slug: 'acme-co' }).success).toBe(true);
  });
  it('rejects a bad slug', () => {
    expect(createWorkspaceSchema.safeParse({ name: 'A', slug: 'bad slug!' }).success).toBe(false);
  });
});

describe('channel/message schemas', () => {
  it('lowercases + validates channel names (General -> general)', () => {
    const r = createChannelSchema.safeParse({ name: 'General' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('general');
    // spaces and uppercase+space rejected (not normalizable away)
    expect(createChannelSchema.safeParse({ name: 'Bad Name!' }).success).toBe(false);
    expect(createChannelSchema.safeParse({ name: 'general' }).success).toBe(true);
  });
  it('rejects empty message content', () => {
    expect(createMessageSchema.safeParse({ content: '   ' }).success).toBe(false);
  });
});

describe('common primitives', () => {
  it('handle regex', () => {
    expect(handleSchema.safeParse('@researcher').success).toBe(true);
    expect(handleSchema.safeParse('researcher').success).toBe(false);
  });
  it('pagination clamps/defaults', () => {
    const r = paginationSchema.safeParse({ limit: '5' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(5);
  });
});

describe('errors', () => {
  it('toAppError wraps unknowns as generic 500', () => {
    expect(toAppError('boom')).toBeInstanceOf(AppError);
    expect(toAppError(new ValidationError('x')).status).toBe(400);
  });
});

describe('Phase 5 — agent loop-safety constants', () => {
  it('chain-depth + hourly caps are set (PLAN.md §8.4)', () => {
    expect(AGENT_LOOP_LIMITS.MAX_CHAIN_DEPTH).toBeGreaterThanOrEqual(3);
    expect(AGENT_LOOP_LIMITS.RUNS_PER_HOUR_PER_WORKSPACE).toBeGreaterThan(0);
    expect(AGENT_LOOP_LIMITS.MAX_CONCURRENT_RUNS_PER_DAEMON).toBeGreaterThanOrEqual(1);
  });
});

describe('Phase 5 — approval policy schema', () => {
  it('accepts known boolean keys', () => {
    const r = approvalPolicySchema.safeParse({
      [APPROVAL_POLICY_KEYS.SHELL]: true,
      [APPROVAL_POLICY_KEYS.OUTSIDE_WORKSPACE]: false,
    });
    expect(r.success).toBe(true);
  });
  it('rejects unknown keys (strict)', () => {
    expect(approvalPolicySchema.safeParse({ evilFlag: true }).success).toBe(false);
  });
  it('rejects non-boolean values', () => {
    expect(approvalPolicySchema.safeParse({ [APPROVAL_POLICY_KEYS.SHELL]: 'yes' }).success).toBe(
      false,
    );
  });
});

describe('Phase 5 — decide-approval + artifact payloads', () => {
  it('decideApprovalSchema accepts approved/denied only', () => {
    expect(decideApprovalSchema.safeParse({ decision: 'approved' }).success).toBe(true);
    expect(decideApprovalSchema.safeParse({ decision: 'denied' }).success).toBe(true);
    expect(decideApprovalSchema.safeParse({ decision: 'maybe' }).success).toBe(false);
  });
  it('artifact payload requires a known artifactType', () => {
    const ok = artifactPayloadSchema.safeParse({
      type: MESSAGE_PAYLOAD_TYPE.ARTIFACT,
      artifactType: ARTIFACT_TYPE.DIFF,
      content: '--- a\n+++ b\n',
    });
    expect(ok.success).toBe(true);
    expect(
      artifactPayloadSchema.safeParse({
        type: MESSAGE_PAYLOAD_TYPE.ARTIFACT,
        artifactType: 'executable',
      }).success,
    ).toBe(false);
  });
});

describe('Phase 6 — cron matcher (scheduled tasks)', () => {
  it('parses 5 fields and rejects bad ones', () => {
    expect(() => parseCron('* * * * *')).not.toThrow();
    expect(() => parseCron('0 9 * *')).toThrow();
    expect(() => parseCron('60 9 * * * *')).toThrow();
  });
  it('every-weekday-at-9 matches Mon 09:00 but not Sat 09:00', () => {
    // 2026-07-13 is a Monday; 2026-07-18 is a Saturday.
    expect(cronMatches('0 9 * * 1-5', new Date(2026, 6, 13, 9, 0))).toBe(true);
    expect(cronMatches('0 9 * * 1-5', new Date(2026, 6, 18, 9, 0))).toBe(false);
    expect(cronMatches('0 9 * * 1-5', new Date(2026, 6, 13, 9, 30))).toBe(false);
  });
  it('cronDue does not double-fire within the same minute', () => {
    const now = new Date(2026, 6, 13, 9, 0);
    expect(cronDue('*/15 * * * *', now, null)).toBe(true);
    expect(cronDue('*/15 * * * *', now, now)).toBe(false); // same minute
    expect(cronDue('*/15 * * * *', new Date(2026, 6, 13, 9, 15), now)).toBe(true);
  });
});

describe('Phase 6 — cost + schema contracts', () => {
  it('estimateCostCents scales by model rates', () => {
    // 1M in + 1M out on default ($3/$15) = $18 = 1800c
    expect(estimateCostCents('claude-sonnet-5', 1_000_000, 1_000_000)).toBe(1800);
    // unknown model uses _default
    expect(estimateCostCents('mystery-model', 1_000_000, 0)).toBe(300);
  });
  it('pushSubscribeSchema requires endpoint + keys', () => {
    expect(
      pushSubscribeSchema.safeParse({
        endpoint: 'https://fcm.googleapis.com/x',
        keys: { p256dh: 'p', auth: 'a' },
      }).success,
    ).toBe(true);
    expect(
      pushSubscribeSchema.safeParse({ endpoint: 'not-a-url', keys: { p256dh: 'p', auth: 'a' } })
        .success,
    ).toBe(false);
  });
  it('scheduleSchema validates a real cron, rejects junk', () => {
    expect(scheduleSchema.safeParse({ cron: '0 9 * * 1-5' }).success).toBe(true);
    expect(scheduleSchema.safeParse({ cron: 'not cron' }).success).toBe(false);
    expect(scheduleSchema.safeParse(null).success).toBe(true); // nullable
  });
  it('agentTeamSchema accepts a known template only', () => {
    expect(agentTeamSchema.safeParse({ template: 'dev' }).success).toBe(true);
    expect(agentTeamSchema.safeParse({ template: 'marketing' }).success).toBe(false);
  });
});
