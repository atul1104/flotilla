# Git Collaboration — Implementation Progress

> Living log of the phased build-out described in [`GIT_COLLABORATION.md`](./GIT_COLLABORATION.md).
> Updated as each phase ships. Dates are absolute (today: 2026-07-21).

## Status at a glance

| Phase | Scope | Status |
|-------|-------|--------|
| 0 — Repair | Fix the mangled `schema.prisma` + failed migration | ✅ Done |
| 1 — Basic Git Integration | crypto, shared schemas/constants, git module (8 endpoints), prompt builder, tests | ✅ Done |
| 2 — Collaboration modes | `collaborationMode` wired into config, card, prompt, dispatch | ✅ Done (API) |
| 3 — Flotilla↔Git bridge | `GIT_SOCKET_EVENTS`, `broadcastGitOperation`, agent git-status, card summary | ✅ Done (API) |
| 4 — Smart handoff | git-event triggers (PR → @qa, merge → @reviewer) + tests | ✅ Done (core) |

> **Scope note.** All four phases are implemented on the **API/server** side and
> covered by tests. Pieces that live in the daemon or need live GitHub
> credentials are intentionally deferred (see [Deferred](#deferred--out-of-scope)).

---

## Phase 0 — Repair schema + migration (2026-07-21) ✅

**Problem found on arrival.** The working-tree `schema.prisma` had been mangled:
the Phase 8 git fields had been copy-pasted into **~20 unrelated models**
(User, EmailToken, Channel, Message, Reaction, PushSubscription, Session, …).
The migration `20260721145200_git_integration` had **failed to apply**
(`applied_steps_count: 0`, no partial DDL in the DB).

Root cause of the failure: malformed `COMMENT ON COLUMN` statements —
`COMMENT ON COLUMN "agents.github_token_encrypted"` (a dot *inside* one quoted
identifier) instead of the correct two-part `"agents"."github_token_encrypted"`.
Postgres rejected it as *“column name must be qualified.”*

**Fix**
- Restored `schema.prisma` from `HEAD`, re-added the correct minimal git fields
  to **only** `Agent` (5) and `Task` (5), plus the new `GitOperation` model.
- Fixed the 7 malformed `COMMENT` lines in `migration.sql`.
- `prisma migrate resolve --rolled-back`, then `prisma migrate deploy` → applied
  cleanly to both Neon (prod) and local Postgres. `migrate status` = up to date.
- Removed the throwaway `inspect-git-db.mjs` and the mangled `schema.prisma.bak`.

---

## Phase 1 — Basic Git Integration (2026-07-21) ✅

**Built**
- `apps/api/src/lib/crypto.js` — AES-256-GCM `encrypt`/`decrypt`
  (`v1:<ivHex>:<authTagHex>:<ctHex>`). Key scrypt-derived from
  `GITHUB_TOKEN_ENCRYPTION_KEY` → `SESSION_SECRET` → dev fallback.
- `packages/shared/src/schemas/git.js` — `githubConfigSchema`,
  `recordGitOperationSchema`, `taskGitContextSchema`, `repoUrlSchema`,
  `githubUrlSchema`.
- `packages/shared/src/constants.js` — `COLLABORATION_MODES`, `GIT_OPERATION`,
  `GIT_OPERATION_STATUS`, `GIT_WORKFLOW`, `SENSITIVE_GIT_OPS`, `GIT_SOCKET_EVENTS`,
  `gitEventForOperation()`, `HANDOFF_TRIGGERS`, `GIT_STATUS_EMOJI`.
- `apps/api/src/modules/git/{service,router,prompts,handoff}.js`.

**Endpoints** (all under `/api/v1`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/agents/:agentId/github-config` | set encrypted token + repo (write-only token) |
| GET | `/agents/:agentId/github-config` | read config (never returns the token) |
| GET | `/agents/:agentId/git-status` | agent git dashboard data |
| PATCH | `/tasks/:taskId/git-context` | set task repo / base / feature branch / PR |
| GET | `/tasks/:taskId/git-status` | task git status + last operation |
| GET | `/tasks/:taskId/git-operations` | audit trail (newest first) |
| POST | `/tasks/:taskId/git-operation` | record a git op → broadcasts + may hand off |
| GET | `/workspaces/:id/github-repos` | repos wired across the workspace |

**Prompts** — `buildGitPrompt()` realizes the `GIT_AGENT_PROMPT` template;
`composeSystemPrompt()` is wired into `runs/service.buildDispatchContext` so a
git-enabled agent's dispatched system prompt automatically includes the repo,
branches, workflow, collaboration mode, and safety rules.

**Verify**
```bash
export DATABASE_URL=postgresql://flotilla:flotilla@localhost:5433/flotilla
npx vitest run src/git.test.js   # 19/19 pass
```

---

## Phase 2 — Collaboration modes (2026-07-21) ✅ (API)

- `collaborationMode` (autonomous / supervised / interactive / manual) is set via
  the `github-config` endpoint and surfaced on the agent card (`agent.git.*`).
- It drives the prompt: `buildGitPrompt` changes its guidance by mode (autonomous
  proceeds but reports; others pause for approval before commits/pushes/PRs).
- `composeSystemPrompt` appends the section at dispatch.
- **Deferred (daemon-side):** `autoApproveEdits` / `requireHumanApproval` map to
  the existing `approvalPolicy` toggles; Claude-Code session transparency
  (`.claude/session.json`, `MEMORY.md`, `claude-code.log`) lives in the daemon.

---

## Phase 3 — Flotilla↔Git bridge (2026-07-21) ✅ (API)

- `GIT_SOCKET_EVENTS` + `gitEventForOperation(operation, status)` taxonomy
  (`branch.created`, `commit.pushed`, `pr.opened`, `pr.merged`, …).
- `realtime.broadcastGitOperation(workspaceId, op)` emits a typed event **and**
  the generic `git.operation.recorded` to the workspace room.
- `GET /agents/:id/git-status` returns the agent's configured repo + last op.
- Agent cards carry a `git` summary (enabled, repo, branch, mode) from the row —
  no extra query, no token.

---

## Phase 4 — Smart handoff (2026-07-21) ✅ (core)

- `maybeTriggerGitHandoff(workspaceId, task, op)` runs after a git op is recorded:
  a successful **PR** op triggers `@qa`; a successful **merge** triggers
  `@reviewer`. Non-chain ops and missing target agents are no-ops. Fire-and-forget,
  best-effort (mirrors `tasks/router.maybeTriggerAgentAssignee`).
- Tested: PR → handoff run created for `@qa`; a commit op creates no extra handoff.

---

## Deferred / out of scope

These need the daemon runtime or live credentials and are not part of this API pass:
- **Real git execution + workspace isolation** (`~/.flotilla/agents/<handle>/workspace/`) — `packages/daemon`. The API records the *results* of git ops; the daemon performs them.
- **Live GitHub repo listing** (`GET /user/repos`) — needs OAuth/token wiring; `listWorkspaceRepos` returns the repos the workspace is wired to today.
- **Sensitive-op approval gating** (`push_to_main`, `force_push`, …) — enforced where git actually runs (daemon).
- **Frontend** — git-status dashboard UI, agent-card git badges, PR/branch timelines (`apps/web`).

---

## Test environment note

Tests must run against the **local** Postgres (`docker-compose` `flotilla-postgres`
on host port **5433**, user/pass/db `flotilla`), not the remote Neon DB in `.env`:
Neon round-trip latency makes the `beforeAll` setup exceed vitest's hook timeout.
Apply the migration locally once, then:
```bash
export DATABASE_URL=postgresql://flotilla:flotilla@localhost:5433/flotilla
export DIRECT_DATABASE_URL=postgresql://flotilla:flotilla@localhost:5433/flotilla
npm test
```

## Test results (2026-07-21)

- `git.test.js`: **19/19 pass** (crypto, prompt, config, ops, status, repos, tenant isolation, handoff).
- Stable suites (`app`, `agents`, `chat`, `tasks`, `security`, `integration`, `realtime`): **44/44 pass**.
- **Pre-existing failures** (unchanged by this work — verified identical on clean `HEAD`):
  - `phase8` (2): stale `maxAgents: 3` assertion after the free-plan agent-limit removal.
  - `phase6` (2): agent-team-template creation returns 400 on `HEAD` too.
  - `phase5`: timing-flaky `waitFor` tests (failure count varies 5–9 across runs).
