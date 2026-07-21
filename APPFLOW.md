# APPFLOW.md — How Flotilla Actually Works (End‑to‑End)

> This document describes the **built** system as it runs today — the real routes,
> socket events, control flow, and data paths — not just the design intent.
> For design rationale see [`PLAN.md`](./PLAN.md); for build history see
> [`PROGRESS.md`](./PROGRESS.md). Where the code diverges from PLAN.md, this doc
> says so explicitly (see [§14 Known deviations](#14-known-deviations-from-planmd)).
>
> **Stack:** React 18 + Tailwind v4 + TanStack Query + Zustand (web) · Express 5 +
> Socket.IO + Prisma + PostgreSQL + pg‑boss (api) · Node CLI daemon with runtime
> adapters · plain JS/ESM with **Zod as the shared contract layer** (no TypeScript).
>
> All file paths are repo‑relative; line numbers are accurate as of this writing.

---

## Table of contents

1. [The 30‑second mental model](#1-the-30-second-mental-model)
2. [System architecture](#2-system-architecture)
3. [The actor model](#3-the-actor-model)
4. [Request lifecycle (middleware chain)](#4-request-lifecycle-middleware-chain)
5. [Identity, auth, workspaces & invites](#5-identity-auth-workspaces--invites)
6. [Chat core & `/client` realtime](#6-chat-core--client-realtime)
7. [Tasks & the board](#7-tasks--the-board)
8. [Agent execution — the run lifecycle](#8-agent-execution--the-run-lifecycle)
9. [Approval gates](#9-approval-gates)
10. [Agent→agent handoffs & loop safety](#10-agentagent-handoffs--loop-safety)
11. [Notifications, push, search, usage, jobs, teams, limits](#11-cross-cutting-features)
12. [Realtime event reference](#12-realtime-event-reference)
13. [REST surface quick‑reference](#13-rest-surface-quick-reference)
14. [Known deviations from PLAN.md](#14-known-deviations-from-planmd)
15. [Data model & file map](#15-data-model--file-map)

---

## 1. The 30‑second mental model

Flotilla is a **Slack‑style workspace where humans and AI agents are teammates**.
The three things to hold in your head:

1. **One identity table for everyone.** Humans and agents are both **actors**
   (`actors.id`). Every message sender, task assignee, channel member, and @mention
   points at an actor — never a polymorphic `(type, id)` pair. A human gets an
   actor at signup; an agent gets one when it's created.
2. **The server owns the conversation; your laptop owns the agent.** Messages,
   tasks, channels, and run history live in Postgres. Agent working files and
   memory live on the user's own machine under `~/.flotilla/agents/<handle>/`.
   Code and data **never leave the machine** unless an agent posts them as a
   message — that's the privacy pitch.
3. **Everything is persist‑first, then broadcast.** A router writes to Postgres,
   *then* Socket.IO broadcasts to a workspace room, *then* browsers patch their
   TanStack Query cache. A client never sees an event for a row that isn't already
   durable. Tenant isolation comes "for free" from room membership — you only join
   `ws:<workspaceId>` rooms for workspaces you belong to.

The signature product moment: you type `@researcher summarize this thread` in a
channel → the server queues an **agent run** → dispatches it over a socket to a
**daemon** running on your laptop → the daemon spawns a **runtime adapter**
(Claude Code headless, or a mock) → the agent streams its thinking back → it posts
a reply into the channel as itself. Along the way it can ask for **approval**, or
**hand work to another agent** by @mentioning it.

---

## 2. System architecture

```
   ┌──────────────┐                     ┌─────────────────────────────────────┐
   │  Web SPA     │  REST (cookie auth) │            API SERVER               │
   │ apps/web     │────────────────────▶│  Express 5  (/api/v1)               │
   │ React+TQ     │                     │  Socket.IO  /client  /daemon        │
   │ +Zustand     │◀──── WS /client ────│  pg‑boss (cron jobs)                │
   └──────────────┘                     │  Prisma ──┐                         │
                                        │           ├─▶ PostgreSQL (truth:    │
   ┌──────────────┐                     │           │   msgs, tasks, runs)    │
   │  Landing     │                     │           └─▶ pg‑boss schema        │
   │ apps/landing │                     │  S3 client ─▶ MinIO / R2 (files)    │
   └──────────────┘                     └───────────▲─────────────────────────┘
                                                    │ WSS /daemon (device token)
                                        ┌───────────┴─────────────────────────┐
                                        │        DAEMON ("Computer")          │
                                        │  packages/daemon  (npx CLI)         │
                                        │  pair · start · install-service     │
                                        │  spawns runtime adapters:           │
                                        │    • mock   (keyless, tested path)  │
                                        │    • claude-code (`claude -p`)      │
                                        │  ~/.flotilla/agents/<handle>/       │
                                        │    AGENT.md · MEMORY.md · workspace │
                                        └─────────────────────────────────────┘
```

**Source‑of‑truth split (load‑bearing):**

| Who owns what | What |
|---|---|
| **Server / Postgres** | users, actors, workspaces, channels, messages, tasks, agents, computers, agent_runs, run_events, approvals, notifications |
| **Daemon / local disk** | agent identity (`AGENT.md`), long‑term memory (`MEMORY.md`), scratch notes, working files/repos in `workspace/` |
| **Object storage (MinIO/R2)** | uploaded files, keyed `uploads/<userId>/...` |

The daemon is the only thing that touches a user's real files; the server never
sees them unless an agent explicitly posts them into a channel.

---

### Git-based collaboration layer (Phase 8+)

For team workflows where multiple humans and agents need to share code, Flotilla
supports a hybrid Git-based collaboration model (GIT_COLLABORATION.md). This adds
a fourth source-of-truth:

| Who owns what | What |
|---|---|
| **GitHub / Git repositories** | Shared code, version history, PRs, collaboration artifacts |

**How it works:**
- Agents work locally in `~/.flotilla/agents/<handle>/workspace/` as before
- Humans with agent oversight can see the Claude Code interface and guide work
- When complete, code is pushed to GitHub with structured commit messages
- Other team members (humans + agents) pull from GitHub and continue the workflow
- Flotilla chat coordinates handoffs: `@coder → @qa → @reviewer`
- Git status (branches, commits, PRs) syncs back to Flotilla task UI

This preserves the local-first privacy model while enabling team collaboration
through Git as the file-sharing layer. See GIT_COLLABORATION.md for the complete
workflow, implementation phases, and best practices.

**One process serves REST + Socket.IO.** Scale‑past‑one‑instance (sticky
sessions + Redis adapter) is a future concern, not a beta concern.

---

## 3. The actor model

`apps/api/prisma/schema.prisma:136` — the unification:

```prisma
model Actor {
  id      String    @id @default(uuid()) @db.Uuid
  kind    ActorKind              // enum { user, agent }
  userId  String?  @unique       // exactly one of these two is set
  agentId String?  @unique
  ...
}
```

- A **user** gets an actor via `ensureUserActor(userId)` (`workspaces/service.js:14`)
  — get‑or‑create, 1:1 with `users`.
- An **agent** gets an actor in its create transaction (`agents/service.js:57`), and
  is added to the workspace as a member with `role: 'agent'` so it can be @mentioned
  and post messages.
- The authenticated request carries **`req.actorId`** (`middleware/auth.js`), and
  *every* downstream authorship/membership/mention uses `actorId` — never `userId`.

> **Why this matters:** because messages, tasks, mentions, reactions, and channel
> membership all reference `actors.id`, a human and an agent are interchangeable as
> a participant. That's what makes "agent posts into the thread" and "agent gets
> assigned a task" identical code paths to the human versions.

---

## 4. Request lifecycle (middleware chain)

Every authenticated request flows through a fixed chain. Routes are thin; services
are the logic.

```
HTTP request
  → cors + helmet + compression + pino-http
  → sessionMiddleware (connect-pg-simple, cookie 'flotilla.sid')
  → rate limiter (auth / password-reset / message-send; skipped in test)
  → requireAuth            (session → req.userId / req.actorId; 401 if absent)
  → requireWorkspaceMember (slug|uuid → req.workspace + req.membership; 403 if not a member)
  → requireRole(admin?)    (role-rank gate; member=0 agent=1 admin=2 owner=3)
  → requireChannelAccess   (for :channelId routes; private/dm need a ChannelMember row)
  → validateBody/Query(Zod)(422 VALIDATION_ERROR on bad shape)
  → route handler          (calls a service, persists, broadcasts)
  → error middleware       (AppError → status; Prisma P2002→409, P2023→400; 5xx masked in prod)
```

- **Tenant isolation is enforced twice:** at the middleware (membership) and again
  in the service (every query filters by `workspaceId`). `requireWorkspaceMember`
  (`middleware/workspace.js:16`) resolves the workspace by slug‑or‑uuid and stamps
  `req.workspace` / `req.membership`.
- **CSRF** is closed by **JSON‑content‑type enforcement** on mutations
  (`app.js:73`): a cross‑origin form POST cannot set `content-type: application/json`
  (it would trigger a CORS preflight that fails), so combined with `SameSite=Lax`
  cookies there's no CSRF surface. Daemon bearer‑token auth is unaffected.
- **Errors** are normalized: every `AppError` subclass carries `{ status, code }`
  (`packages/shared/src/errors.js`); the handler maps Prisma codes and masks
  internal messages in production.

---

## 5. Identity, auth, workspaces & invites

### 5.1 Signup → workspace (one transaction)

`POST /api/v1/auth/signup` (`auth/router.js:22`) — `signupSchema`
(`{ email, name, password (≥12), workspaceName? }`).

`signUp` (`auth/service.js:36`):
1. Duplicate‑email → `ConflictError` (409).
2. `argon2.hash(pw, { type: argon2id })`.
3. `user.create`.
4. If `workspaceName` → `createWorkspace(...)` (below); else just `ensureUserActor`.
5. `startEmailVerification(...)` (best‑effort mail).
6. **`loginUserSession(req, userId)`** — regenerates the session id (session‑fixation
   fix, `lib/sessionAuth.js:7`) and stamps `userId`.

`createWorkspace` (`workspaces/service.js:21`) does, **in one `$transaction`**:
slugify + uniqueness → `ensureUserActor` → `workspace.create({ plan:'free' })` →
`workspaceMember.create({ role:'owner' })` → `channel.create({ name:'general', kind:'public' })`
→ `channelMember.create` (owner joins #general).

### 5.2 Sessions

`lib/session.js:15` — `connect-pg-simple` over the same Postgres pool, cookie
`flotilla.sid`, `httpOnly + SameSite=Lax + Secure(in prod)`, `rolling:true`,
`maxAge: 30d`. The `session` table is created by the store and also modeled in Prisma.

- `GET /auth/me` → `{ user, workspaces: [...] }`.
- `POST /auth/login` (`authLimiter`) — constant‑time argon2 verify; a **dummy hash on
  the missing‑user branch** blunts timing probes; one generic "Invalid email or
  password" message never reveals account existence. Regenerates sid on success.
- `POST /auth/logout` → `session.destroy()` + clear cookie.
- `PATCH /auth/me` → update `{ name?, avatarUrl? }` (a small addition beyond PLAN).

### 5.3 Email verify & password reset

Both share the `EmailToken` table, split by `purpose` (`verify_email` | `reset_password`).
Tokens are 128‑bit random, **stored only as sha256** (`lib/tokens.js`); the plaintext
appears once, in the email link. TTLs: verify 24h, reset 1h.

- **Atomic single‑use** via a conditional `updateMany WHERE used_at IS NULL AND expires_at > now()`
  (`auth/service.js:110`); under READ COMMITTED exactly one concurrent consumer wins,
  the rest get `count === 0` → `ConflictError`.
- **Reset** also runs `DELETE FROM session WHERE sess->>'userId' = ...` — invalidates
  every existing session for the user ("lock back down to only me").
- **Forgot‑password** is account‑existence‑opaque: always returns `{ ok:true }`, and
  the no‑account branch does a dummy argon2 hash to match the token‑insert cost.
- Mail is **fire‑and‑forget** so an SMTP hiccup never gates the HTTP response or
  becomes a timing oracle.

### 5.4 Invites (the critical split)

`Invite` rows store the token as sha256, 7‑day TTL. `POST /workspaces/:id/invites`
requires `ADMIN`. The accept route (`POST /invites/:token/accept`, `optionalAuth`)
**serves both anonymous and logged‑in callers** and branches:

- **Anonymous** → `signUpViaInvite` — **refuses to resolve to an existing account**
  (409 "log in first"). This closes a pre‑auth account‑takeover: without it, an
  attacker with a leaked invite link for a victim's email could set a password and
  seize the account. (Regression‑tested in `security.test.js:52`.)
- **Logged‑in** → `acceptInviteAuthenticated` — **recipient‑bound**: the session
  user's email must case‑insensitively match the invited email (403 otherwise).

Both paths: atomic single‑use consume; `addActorToWorkspace` **never re‑roles an
existing member** (an invite can't silently downgrade/escalate someone); the invitee
is added to #general; `loginUserSession` regenerates the sid. Preview
(`GET /invites/:token`) returns `{ workspaceName, slug, role }` and deliberately
**omits the invited email** (PII scrubbing).

### 5.5 Onboarding funnel

Stored in `workspace.settings.onboarding` (no schema change). Four steps —
`workspace_created` (synthesized from `createdAt` on read), `computer_paired`,
`first_agent`, `first_run` — each marked at its natural site (`computers/service.js`,
`agents/service.js`, `runs/service.js:615`), all wrapped in `.catch(()=>{})` so a
metrics failure can't break the operation. Read via `GET /workspaces/:id/onboarding`.

---

## 6. Chat core & `/client` realtime

### 6.1 Channels — public / private / DM

Visibility (`channels/service.js:11`): **public** = visible to any workspace member;
**private/DM** require an explicit `ChannelMember` row.

- `POST /workspaces/:id/channels` (public|private; DMs excluded from the schema).
- `POST /workspaces/:id/dms { actorIds[] (≥2) }` → **find‑or‑create** by exact sorted
  member set.
- `GET /workspaces/:id/channels` — the sidebar query: all public + the actor's
  private/DM memberships, sorted by kind then name, **with per‑channel unread counts**
  (count of others' messages with `id > lastReadMessageId`).
- `POST /channels/:id/read { messageId }` — advances the read cursor (also driven by
  the socket `channel.read` event).
- Membership add/remove, update (name/topic), all behind `requireChannelAccess`.

### 6.2 Messages — pagination, threads, reactions, mentions

- **Pagination** is a `(createdAt, id)` keyset, **newest‑first**, top‑level only,
  `take: limit+1` to detect `hasMore` (`messages/service.js:49`). Cursor is
  base64url of `createdAt|id`. **Threads** are oldest‑first. Every read enriches
  with `sender`, aggregated `reactions`, and `replyCount`.
- **Free‑plan history gate**: `listMessages` adds `createdAt >= historyCutoff(plan)`
  (30 days for Free) — the read is gated, **data is retained**.
- **Create** (`POST /channels/:id/messages`): validates → **optimistic dedupe by
  `clientNonce`** (returns the existing message if seen in the last 60s) →
  `message.create` (connecting `attachmentIds`) → server‑side **@mention resolution**
  → broadcast → fire‑and‑forget `triggerForMentions` (for mentioned agents) and
  `notifyMention` (for mentioned humans).
- **@mention resolution** (`messages/service.js:230`): regex `@token`; resolvable
  set = workspace members for public channels, **channel members only** for
  private/DM (so an agent not in a private channel is never resolved/triggered —
  the Phase 5 authz fix). Agents resolve by `@handle`, humans by name/email‑local‑part.
- **Edit/delete** — owner‑only; delete is **soft** (`deletedAt`). Reactions
  aggregate to `{ emoji, count, reactors[] }`.
- **Rate limit** — `messageLimiter` 120/min keyed by `actorId || ip` (throttles a
  spamming human **and** a runaway agent, since agents post through the same surface).

### 6.3 Uploads — workspace‑scoped presign

`POST /workspaces/:id/uploads/presign { filename, mime, size }` →
1. validate size (≤50 MiB) + mime allowlist;
2. **`assertUploadQuota(workspaceId, plan, size)`** at presign time (Free 100 MB/mo);
3. create an `Attachment` row up front (`messageId: null`);
4. return a presigned **PUT** URL (TTL 300s) + the `attachmentId`.

The browser **PUTs the file directly to MinIO/S3**, then sends `attachmentIds` with
the message, which connects them. The route is workspace‑scoped (not `/users/...`)
specifically so the per‑plan quota can run before any bytes hit the bucket. (The
S3 key stays user‑scoped: `uploads/<userId>/...`.)

### 6.4 The `/client` Socket.IO namespace

`realtime/index.js` — auth via the **session cookie** (bridged onto the socket
handshake); on connect the socket joins **`ws:<workspaceId>`** for every workspace
it belongs to, plus `user:<userId>` and `actor:<actorId>`.

**Persist‑first rule** (PLAN §4, enforced everywhere): routers call the broadcast
helpers **after** the Prisma write. So a client never receives an event for a row
that isn't already durable; on reconnect, REST is the source of truth.

**Tenant isolation by construction:** broadcasts target `clientNs.to('ws:<id>')`, and
a socket is only in `ws:<id>` if it's a member — isolation is a property of room
membership, not a per‑event ACL.

**Server→client events** (from `CLIENT_SOCKET_EVENTS`, `constants.js:227`):
`message.created/updated/deleted`, `reaction.added`, `channel.created/updated`,
`member.joined/left`, `task.created/updated`, `run.started/event/finished`,
`agent.status`, `computer.status`, `approval.requested/decided`,
`notification.created` (to `user:<id>` only), `typing`.

**Client→server:** `typing.start { channelId }` (re‑broadcast server‑signed with the
auth actor, so clients can't spoof who's typing) and `channel.read { channelId, messageId }`.

### 6.5 Frontend data flow

One singleton `io('/client')` (`lib/socket.js`). The `RealtimeProvider` patches the
TanStack Query cache directly from events:

- `message.created` → `upsertMessage` (dedupe by `id`, prepend to newest page) +
  invalidate `['channels']` for unread badges.
- `message.updated` → `patchMessage`; `message.deleted` → soft‑mark `deletedAt`.
- reactions → swap the aggregated `reactions` array.
- `typing` → dispatched as a `window` `CustomEvent` (not cached), held 3.5s.
- task/run/approval/notification events → `invalidateQueries` → refetch.

**Optimistic send + reconcile** (`useSendMessage`): the Composer mints a `clientNonce`,
the mutation waits for the server echo, then dedupes by `id`. Whether the socket event
or the POST resolves first, both converge on the same cached row — no duplicates even
on double‑click or network retry (the server dedupes by `clientNonce`, the client by
`id`). The message list is **virtualized** (`@tanstack/react-virtual`, dynamic
measurement) and markdown is rendered with **`rehype-sanitize`** (no raw HTML/scripts).

---

## 7. Tasks & the board

### 7.1 Model

`Task` (`schema.prisma:325`): `status` enum `backlog | claimed | running | needs_review
| done | cancelled`; `priority` 0–5; `assigneeId` → **Actor** (human *or* agent);
`parentTaskId` (subtasks/handoffs); `rootMessageId` (the in‑chat card that anchors the
discussion thread); `dueAt`; `schedule` jsonb `{cron, tz, lastFiredAt}`. `TaskEvent`
is the audit trail (`type, payload, actorId`).

### 7.2 Create task → card message (the chat‑first design)

Creating a task **with a `channelId`** posts a structured **task‑card message**
(`payload.type === 'task_card'`) into that channel and binds it as the task's
discussion‑thread root — all in one transaction (`tasks/service.js:53`). The router
then broadcasts **both** `task.created` (board) **and** `message.created` (the card in
chat). When status later changes, `updateTask` rewrites the card's `payload.status` so
the in‑chat card stays accurate. The card renders inline as a click‑through to `/tasks`.

### 7.3 Lifecycle, claim/handoff/complete, permissions

There's no hard transition table — `PATCH /tasks/:id` accepts any status. Two
special‑cased helpers: `claim` (refuses on a terminal status) and `complete` (→ DONE,
stamps `completedAt`). `updateTask` is the central mutator: it diffs the patch, emits
audit events (`status_changed {from,to}`, `assigned {from,to}`), and syncs the card.

- **`canMutateTask`** (creator/assignee/admin/owner) gates **only** `PATCH` and
  `handoff`. `claim` and `complete` are open to any workspace member. Every task route
  first runs `loadTaskForActor` (404 missing / 403 non‑member) so isolation holds.
- **Assigning a task to an agent triggers a run** (`maybeTriggerAgentAssignee`,
  `tasks/router.js:38`) — the bridge from "task assigned" to "agent works the thread".
  It passes the *previous* assignee so a no‑op reassign won't refire.
- **Handoff** (`POST /tasks/:id/handoff { toActorId }`) is task‑level reassign + claim
  (so its audit event is `assigned`, not a literal `handoff`). Richer agent→agent
  subtask creation is Phase 5 (§10) and isn't invoked here.

### 7.4 Board & scheduling

- **Kanban** (`pages/Tasks.jsx`) — five columns (cancelled excluded), native HTML5
  drag‑and‑drop; a drop issues a `PATCH { status }` (which *does* require
  `canMutateTask`, so a non‑author drag gets 403). List view + a modal detail (the
  task detail is a modal, not a route) showing status, priority, schedule, actions,
  and the **Activity** audit list from `GET /tasks/:id/events`.
- **Scheduled tasks** (improvement #4) — the `schedule {cron, tz}` field, validated by
  *parsing* it with the pure matcher (`shared/cron.js`). A pg‑boss `* * * * *` tick
  (`fireScheduledTasks`) fires any due, non‑terminal task **assigned to an agent** as
  a run (`trigger:'schedule'`), then stamps `lastFiredAt` to prevent double‑fires.
  > Note: `tz` is stored/validated but **not applied** — matching uses server‑local time.

---

## 8. Agent execution — the run lifecycle

*This is the heart of the product.* `AgentRun` (`schema.prisma:433`) is the unit of
work: `agentId, computerId, workspaceId, taskId?, triggerMessageId?, status, model,
tokensIn/Out (BigInt), costEstimateCents, chainDepth, parentRunId, trigger`, plus
`queuedAt/startedAt/finishedAt`. `RunEvent` (`@@unique([runId, seq])`) is the ordered,
dedup‑safe stream that powers the live "thinking" UI.

### 8.1 Pairing (stateless HMAC codes)

`POST /workspaces/:id/computers/pairing-code` (member only) mints
`base64url({ws, owner, exp}).HMAC-SHA256(payload)` (`computers/service.js:13`), signed
with `SESSION_SECRET`, 10‑minute TTL, **verified with constant‑time `safeEqual`**.
There is **no pairing table** — the code is self‑validating.

`POST /daemon/pair` (**unauthenticated — the code is the proof**) verifies it, creates
the `Computer`, mints a **256‑bit device token stored only as sha256** (shown once,
revocable), marks the `computer_paired` onboarding step, and returns
`{ computerId, deviceToken }`. The daemon CLI `pair <server> <code>` writes
`~/.flotilla/config.json`.

### 8.2 Daemon connect (`/daemon` namespace)

Device‑token auth (`realtime/index.js:76`) → `resolveDeviceToken` (sha256 lookup,
revocation‑aware) → joins `computer:<id>`, marks the computer online + its agents
`idle`, broadcasts `computer.status`. **Handlers are registered synchronously before
the async presence work** (`realtime/index.js:106`) so a daemon emitting immediately
on connect isn't dropped. A **`guardRun`** ownership check
(`run.computerId === socket's computer.id`) is applied to every inbound run event — a
daemon can only touch its own runs. Heartbeats refresh `lastSeenAt`; on disconnect the
computer + its agents go offline.

> Offline detection is **purely socket‑disconnect‑driven**. `HEARTBEAT.MISSED_THRESHOLD`
> is defined but not enforced (see [§14](#14-known-deviations-from-planmd)).

### 8.3 Triggers

`triggerRun` (`runs/service.js:151`) is called from: **@mention** of an agent
(`triggerForMentions`, `trigger:'mention'`), **task assignment** (`'task'`),
**scheduled task** (`'schedule'`), **agent→agent handoff** (`'handoff'`), **retry**
(`'retry'`), and the **Test button** (`POST /agents/:id/test`).

> The `dm` and `test` trigger enum values are **defined but unused** — DMs and test
> runs both flow through the default and are recorded as `mention` ([§14](#14-known-deviations-from-planmd)).

### 8.4 `triggerRun` — loop safety + queue/dispatch decision

1. Load agent (+ actor + computer); 404 if missing/cross‑workspace.
2. **Resolve chain depth** — `parent.chainDepth + 1` if handed off, else 0.
3. **Self‑trigger guard** (backstop to `triggerForMentions`'s `excludeActorId`).
4. **Chain‑depth cap** — `depth > MAX_CHAIN_DEPTH (5)` → `RunRefusedError('chain_depth')`.
5. **Hourly cap** — `recentRunCount(ws) >= RUNS_PER_HOUR_PER_WORKSPACE (200)` →
   `RunRefusedError('hourly_cap')`. (`RunRefusedError` → **HTTP 429**, `code:'RUN_REFUSED'`.)
6. Create the run **`queued`** with `chainDepth, trigger`.
7. **Computer‑online check** — if offline, post a `🖥️ offline, run queued` note in the
   thread and **leave it queued**. (Reconnect → `dispatchQueuedForComputer`; a finished
   sibling run → `drainQueuedForAgent`.)
8. **One‑run‑per‑agent** — if no active run (`dispatched|running|awaiting_approval`),
   dispatch now; otherwise it stays queued and is drained when the active run finishes.

> A queued run is **never timed out** — it waits indefinitely for a computer/agent
> slot. There is no 15‑minute sweep (see [§14](#14-known-deviations-from-planmd)).

### 8.5 Dispatch → daemon → adapter → ingest → finish

```
triggerRun ──▶ (queued) ──▶ dispatchPersistedRun
                              │  agent.status=running; run=dispatched
                              │  buildDispatchContext ──▶ run.dispatch (to computer:<id>)
                              ▼
                          DAEMON (client.js)
                              │  ensureAgentHome · loadMemory(AGENT.md+MEMORY.md)
                              │  pick adapter by agent.runtime (mock | claude-code)
                              │  adapter.startRun({context, onEvent, postMessage, requestApproval})
                              │     └─ onEvent ──▶ run.event {runId, seq, type, payload}   (daemon owns seq)
                              │     └─ postMessage ──▶ run.message                          (agent posts into thread)
                              │     └─ requestApproval ──▶ approval_request                 (parks run, §9)
                              ▼
                          SERVER ingestEvent (runs/service.js:255)
                              │  insert RunEvent  ──▶ unique(runId,seq) dedupes replays
                              │  status allowlist: daemon can set RUNNING/DISPATCHED only (no forging terminals)
                              │  broadcast run.event ──▶ ws:<id>  (live RunActivity UI)
                              ▼
                          run.finished {runId, status, usage}
                              │  finishRun: cost, agent=idle, void open approvals,
                              │  notifyRunFinished (if a human triggered it),
                              │  drainQueuedForAgent, mark first_run onboarding
```

- **Dispatch context is lean** — `{ runId, agent:{...}, context:{ channel, trigger(text),
  threadRootId, task, chainDepth, parentRunId } }`. There is **no `recentMessages`
  history window**; conversation memory is supplemented daemon‑side via
  `AGENT.md`/`MEMORY.md` ([§14](#14-known-deviations-from-planmd)).
- **Runtime adapter shape** (`adapters/mock.js`): `startRun({...}) → { cancel(), done,
  status(), usage() }`, receiving `onEvent`, `postMessage`, `requestApproval`. The
  daemon owns the per‑run `seq` counter, so adapter events and the approval gate share
  one counter — the server's `(runId, seq)` dedup never collides.
- **Event ingestion is ordered + deduped**: the daemon assigns monotonic `seq`; the
  `@@unique([runId, seq])` constraint makes replay safe on reconnect (duplicate insert
  → swallowed). A **status allowlist** (`{running, dispatched}`) means a daemon **cannot
  forge a terminal status** — terminals only happen via `run.finished`; the approval
  park only via the `approval_request` path.
- **Reliability = TCP + `(runId, seq)` dedup.** There are **no socket acks** and the
  `run.event` client broadcast is **not throttled** ([§14](#14-known-deviations-from-planmd)).
- **`run.message`** posts an agent‑authored message in the trigger thread (or `#general`
  for test runs), then — if it mentioned another agent — **re‑enters `triggerForMentions`
  as a handoff** (§10).

### 8.6 Runtime adapters

- **`mock`** (the keyless, fully‑tested path; what CI and the seed use) — scripted
  stream + reply, with opt‑in artifact/handoff/approval paths driven by context markers.
- **`claude-code`** — spawns `claude -p --output-format stream-json` with
  `cwd = agent workspace`, feeding it the loaded memory; maps `tool_use` events to
  approval cards (§9). Produces real replies only with the `claude` CLI + credentials
  present — swapping those in is a data‑only change.

### 8.7 Retry & cancel

`POST /runs/:id/retry` (only on a terminal status) re‑triggers with `trigger:'retry'`
and **no `parentRunId`/`chainDepth` → resets chain depth to 0**. `POST /runs/:id/cancel`
emits `run.cancel` to the daemon, then `finishRun(cancelled)` (voids open approvals,
drains the queue).

---

## 9. Approval gates

Improvement #3 — a gated tool action parks the run, posts an **ApprovalCard** in the
thread, and resumes on a human decision.

```
adapter hits a gate ──▶ requestApproval(action)
                          │  daemon: approval_request event (seq'd)
                          ▼
                       SERVER requestApproval (runs/service.js:408)
                          │  create Approval row + APPROVAL card message in thread
                          │  run.status = awaiting_approval
                          │  broadcast approval.requested ──▶ ws:<id>
                          │  notifyApprovalRequested (+ push) to human members
                          ▼
                       human clicks Approve/Deny
                          │  POST /approvals/:id/decide {decision}
                          ▼
                       decideApproval — ATOMIC claim (updateMany WHERE decision IS NULL)
                          │  loser of a race → 409 (no double-decide)
                          │  flip card payload → rebroadcast
                          │  run-status guard: only resume if STILL awaiting_approval
                          │  sendApprovalDecision ──▶ daemon resolves requestApproval() promise
                          ▼
                       run resumes (or, on deny, the adapter sets status accordingly)
```

- **Atomic double‑decide guard** — `updateMany WHERE decision IS NULL` means two
  concurrent decides race; exactly one updates a row.
- **Run‑status guard** — a decision on a run that was cancelled/finished in the
  meantime (its approvals were **voided** to `denied`/`cancelled`) cannot resurrect it.
- **claude‑code gating is best‑effort / non‑blocking** — the headless `-p` CLI can't
  block a tool; a true block‑and‑ask needs the Claude Agent SDK `canUseTool` hook. The
  card is posted; today the tool has already proceeded. The fully‑tested gate path is
  the **mock** adapter (driven by `/approve|run tests|needs approval/i` in the text).
- **Two‑layer label sanitization** — the adapter sends only a minimal descriptor
  (command text or file path, never full tool input — which for Write/Edit includes
  file *contents* and could exfiltrate secrets), and the server re‑validates against
  `approvalRequestPayloadSchema` (`label ≤ 200`) before turning it into a card.

---

## 10. Agent→agent handoffs & loop safety

The "multi‑agent magic" is **just mentions + tasks composing** — no special machinery.
When an agent's `run.message` @mentions another agent, `postAgentMessage` re‑enters
`triggerForMentions` with `{ parentRunId, excludeActorId, trigger:'handoff' }`
(`runs/service.js:307`):

1. **Self‑trigger skip** (`excludeActorId`) — an agent never triggers itself.
2. **Subtask creation** — if the parent run has a task, `createSubtask` makes a child
   task (`parentTaskId`, `status:claimed`, assigned to the recipient) and the child run
   binds to **the subtask**, not the parent.
3. `triggerRun` with the bumped `chainDepth`.
4. **A refused handoff isn't fatal** — on `RunRefusedError` (chain/hourly cap), a
   `🛑 couldn't hand off to @handle` note is posted **by the originating agent**, not
   the blocked target.

**Loop‑safety enforcement map:**

| Control | Where |
|---|---|
| `MAX_CHAIN_DEPTH = 5` | `triggerRun` refuses beyond it |
| `RUNS_PER_HOUR_PER_WORKSPACE = 200` | `triggerRun` hourly count |
| Self‑trigger | `triggerForMentions` `excludeActorId` + `triggerRun` backstop |
| One‑run‑per‑agent | `dispatchPersistedRun` + `drainQueuedForAgent` count active runs |
| ~~`MAX_CONCURRENT_RUNS_PER_DAEMON = 2`~~ | **declared but not enforced** ([§14](#14-known-deviations-from-planmd)) |

**Agent memory** (`packages/daemon/src/memory.js`): `~/.flotilla/agents/<handle>/`
holds `AGENT.md` (identity, seeded from the server prompt if absent), `MEMORY.md`
(long‑term, agent‑maintained; a durable run‑summary line is appended at finish),
`notes/`, and `workspace/` (the runtime cwd — repos/artifacts). Real runtimes can
rewrite `MEMORY.md` themselves via the cwd.

---

## 11. Cross‑cutting features

### Notifications
Per‑user rows (`type` is free text; only `mention | approval | run_finished` are
emitted). Three creators wired at their natural sites: `notifyMention` (messages
router, for mentioned humans), `notifyApprovalRequested` (runs service, to human
members), `notifyRunFinished` (runs service, only when a human triggered the run).
Each creates the row → emits `notification.created` to `user:<id>` → fires web push.
`GET /notifications`, `POST /notifications/read {ids?}` (empty = mark all). Bell +
dropdown in the top bar; full `/notifications` page.

### Web push (improvement #8)
`PushSubscription` (no unique constraint on `endpoint`). **Silent no‑op when VAPID
keys are unset** (`isPushEnabled()`); `GET /push/vapid-public` tells the browser.
`subscribe` does `findFirst(userId,endpoint)` + create/update (the upsert‑without‑a‑
unique‑constraint fix). `sendPush` fans out and **prunes dead endpoints** (404/410).
The dependency‑free service worker (`public/sw.js`) shows the notification and focuses/
opens the app on click.

### Search (Postgres FTS)
`GET /workspaces/:id/search?q=&type=messages|tasks|files`. Messages use a **generated
`tsvector` column + GIN index** (`to_tsvector('simple', content)`), ranked by
`ts_rank`, workspace‑scoped via the channels join, soft‑deletes excluded. Tasks/files
use ILIKE. Double tenant lock (middleware + per‑query `workspaceId`). ⌘K `SearchBar`
palette + a `/search` page.

### Usage / cost observability (improvement #2)
`GET /workspaces/:id/usage?days=` (`usageQuerySchema` `.max(365)`, also clamped in the
service). Aggregates `agent_runs` into totals + by‑day + by‑agent (tokens/cost/runs);
cost comes from `estimateCostCents(model, in, out)` using `MODEL_COST_PER_MTOK`. The
`/usage` dashboard (Recharts: tokens/day line, cost/day bar, per‑agent table, 7/30/90d).
(The `usage_counters` table is modeled but reserved for Phase 7 billing; the dashboard
reads live from `agent_runs`.)

### Activity feed
`GET /workspaces/:id/runs` (membership‑guarded, agent name joined) + the `/activity`
page (status, trigger, chain depth, tokens, retry).

### pg‑boss jobs
`initBoss` (`lib/boss.js`) creates its own Postgres schema, **short‑circuits in test**
(workers unit‑tested directly), and registers: **`scheduled-task-tick`** (`* * * * *`)
→ `fireScheduledTasks`; **`daily-jobs`** (`17 9 * * *`) → `sendDigests` (email summary
of unread notifications) + `cleanupOldEvents` (delete `run_events` older than 90 days —
**never messages**).

### Agent‑team templates (improvement #5)
`research` / `dev` / `support` templates (`AGENT_TEAM_TEMPLATES`, all `runtime:mock`).
`POST /workspaces/:id/agent-teams { template, computerId? }` creates the pre‑configured
agents with **handle‑conflict suffixing** (`researcher`, then `researcher-2`, …) and
runs `assertAgentCap` **per agent in the loop** (so a Free workspace can partially apply
then 402 on the 4th). Unknown template → 400 via Zod (404 backstop in the service).

### Plan‑limit enforcement (Phase 8 gap‑fill)
`PLAN_LIMITS` (Free / Pro / Enterprise) is the single source — flipping a workspace to
Pro is a data change, not a code change. Three enforcement points →
**`PaymentRequiredError` (HTTP 402, `code:'PLAN_LIMIT'`)**:

| Limit | Enforcement point |
|---|---|
| Agents (Free = 3) | `assertAgentCap` in `createAgent` / `createAgentTeam` |
| Message history (Free = 30d) | `historyCutoff` in `listMessages` — read gated, **data retained** |
| Uploads (Free = 100 MB/mo) | `assertUploadQuota` at **presign** time |

### PWA (improvement #8)
`manifest.webmanifest` + `public/sw.js` make it installable + push‑capable. ⚠️
**`icons: []` is empty** — Chrome's rich install prompt needs 192/512/maskable icons
(see [§14](#14-known-deviations-from-planmd)).

---

## 12. Realtime event reference

### `/client` namespace (browsers) — `CLIENT_SOCKET_EVENTS` (`constants.js:227`)

**Server → client** (emitted to `ws:<workspaceId>`, except where noted):

| Event | Payload |
|---|---|
| `message.created` | `{ channelId, message, mentionedActorIds }` |
| `message.updated` | `{ channelId, message }` |
| `message.deleted` | `{ channelId, messageId }` |
| `reaction.added` | `{ channelId, messageId, emoji, added, actorId, reactions }` |
| `channel.created` / `channel.updated` | `{ channel }` |
| `member.joined` / `member.left` | (declared; not currently emitted) |
| `task.created` / `task.updated` | `{ task }` |
| `run.started` / `run.finished` | `{ run }` |
| `run.event` | `event` (live activity) |
| `agent.status` | `{ agentId, status }` |
| `computer.status` | `{ computerId, status }` |
| `approval.requested` / `approval.decided` | `{ approval }` |
| `notification.created` | `{ notification }` — **`user:<id>` only** |
| `typing` | `{ channelId, actorId, name }` |

**Client → server:** `typing.start { channelId }`, `channel.read { channelId, messageId }`.

### `/daemon` namespace (computers) — `DAEMON_SOCKET_EVENTS` (`constants.js:257`)

| Direction | Event | Payload |
|---|---|---|
| server → daemon | `run.dispatch` | `{ runId, agent:{...}, context:{...} }` |
| server → daemon | `run.cancel` | `{ runId }` |
| server → daemon | `approval.decision` | `{ runId, approvalId, decision }` |
| daemon → server | `run.event` | `{ runId, seq, type, payload }` |
| daemon → server | `run.message` | `{ runId, content, payload? }` |
| daemon → server | `run.finished` | `{ runId, status, usage }` |

(`agent.sync`, `agent.register`, `computer.info` are declared but unused.)

---

## 13. REST surface quick‑reference

All under `/api/v1`. Cookie session for browsers; `Authorization: Bearer <device-token>`
for the daemon (only `/daemon/pair`, which is code‑auth). Cursor pagination on lists.

| Area | Key routes |
|---|---|
| **Auth** | `POST /auth/signup|login|logout` · `GET|PATCH /auth/me` · `POST /auth/verify-email|forgot-password|reset-password` |
| **Workspaces** | `POST|GET /workspaces` · `GET|PATCH /workspaces/:id` · `GET /workspaces/:id/members|onboarding` · `POST /workspaces/:id/invites` · `GET|POST /invites/:token(/accept)` |
| **Channels** | `POST|GET /workspaces/:id/channels` · `POST /workspaces/:id/dms` · `GET|PATCH /channels/:id` · `POST|DELETE /channels/:id/members(/:actorId)` · `POST /channels/:id/read` |
| **Messages** | `GET|POST /channels/:id/messages` · `PATCH|DELETE /messages/:id` · `GET /messages/:id/thread` · `POST|DELETE /messages/:id/reactions` |
| **Files** | `POST /workspaces/:id/uploads/presign` · `POST /uploads/complete` |
| **Tasks** | `POST|GET /workspaces/:id/tasks` · `GET|PATCH /tasks/:id` · `POST /tasks/:id/claim|handoff|complete` · `GET /tasks/:id/events` |
| **Agents** | `POST|GET /workspaces/:id/agents` · `GET|PATCH|DELETE /agents/:id` · `POST /agents/:id/test` |
| **Agent teams** | `GET /workspaces/:id/agent-templates` · `POST /workspaces/:id/agent-teams` |
| **Computers** | `POST /workspaces/:id/computers/pairing-code` · `POST /daemon/pair` · `GET /workspaces/:id/computers` · `DELETE /computers/:id` |
| **Runs** | `GET /workspaces/:id/runs` · `GET /agents/:id/runs` · `GET /runs/:id(/events)` · `POST /runs/:id/cancel|retry` · `POST /approvals/:id/decide` |
| **Notifications** | `GET /notifications` · `POST /notifications/read` · `GET|POST|DELETE /push/subscribe` · `GET /push/vapid-public` |
| **Search / Usage** | `GET /workspaces/:id/search` · `GET /workspaces/:id/usage` |

---

## 14. Known deviations from PLAN.md

The build is faithful to the design in the large, but several specifics differ. These
are all **verified against source**:

1. **No 15‑minute queued‑run timeout.** PLAN §8.5 said a queued run "stays queued 15 min,
   then fails." Not implemented — a queued run waits indefinitely for a computer/agent
   slot (reconnect or drain). No sweep job exists.
2. **Dispatch context is lean.** `run.dispatch` carries only the trigger text + ids —
   **no `recentMessages` / `mentionsOfAgent` window**. Conversation memory is
   supplemented daemon‑side via `AGENT.md`/`MEMORY.md`.
3. **No socket acks; `run.event` broadcast not throttled.** Reliability = TCP delivery +
   `(runId, seq)` dedup making replay safe on reconnect.
4. **`MAX_CONCURRENT_RUNS_PER_DAEMON` (2) is declared but never enforced.** Real
   concurrency control is the **per‑agent one‑run‑at‑a‑time** rule.
5. **`HEARTBEAT.MISSED_THRESHOLD` (2) is not enforced.** Offline detection is purely
   socket‑disconnect‑driven.
6. **`dm` and `test` trigger values are unused** — both flow through the default and are
   recorded as `mention`.
7. **Pairing codes are stateless HMAC** (no `pairings` table) — matches PLAN §8.1's
   intent; a leaked code is valid 10 min and only ever creates a computer tied to the
   payload's workspace/owner.
8. **claude‑code approval gating is best‑effort** (non‑blocking `-p` CLI); the fully
   tested path is the **mock** adapter. Needs the Agent SDK `canUseTool` hook for a true
   block‑and‑ask gate.
9. **PWA `manifest.icons` is empty** — installable via service worker, but Chrome's rich
   install prompt needs 192/512/maskable icons.
10. **`citext` deferred** — emails/slugs are plain `String @unique`, lowercased at the
    Zod/app edge.
11. **Google OAuth deferred** — `User.passwordHash` is nullable as a placeholder, but
    only email+password auth is wired.
12. **`task_assigned` / `handoff` notification types are defined but never emitted**;
    `notification.type` is free text, not a DB enum.
13. **`usage_counters` / `subscriptions` tables exist but are unused** (reserved for
    Phase 7 billing); the usage dashboard reads live from `agent_runs`.
14. **`POST /uploads/complete` is dead code** — attachment→message linkage happens via
    `attachmentIds` on send.
15. **Test‑suite residue:** the suite deletes test *users* but leaves orphaned *workspaces*
    (the `Workspace.owner` FK has no `onDelete`), so each `npm test` run accumulates
    workspace rows in the shared dev DB. Non‑blocking (tests stay green); reset with
    `prisma migrate reset` when you want a clean demo DB.

---

## 15. Data model & file map

### Core tables (Postgres, via Prisma)

```
Identity      users · actors (unified) · session (connect-pg-simple) · email_tokens
Workspaces    workspaces · workspace_members · invites
Channels      channels · channel_members · messages · attachments · reactions · mentions
Tasks         tasks (self‑ref parent) · task_events
Agents/Runs   agents · computers · device_tokens · agent_runs · run_events · approvals
Phase 6       notifications · push_subscriptions · (usage_counters, subscriptions — reserved)
FTS           messages.search_tsv (generated tsvector + GIN)
```

### File map (the parts that matter for flow)

```
apps/api/src/
  app.js                      middleware wiring + route mounts + CSRF content-type guard
  realtime/index.js           /client + /daemon namespaces; broadcast helpers; guardRun
  middleware/                 auth · workspace · channel · rateLimit · validate · error
  lib/                        session · sessionAuth · tokens · storage · limits · boss · mailer
  modules/
    auth/ workspaces/ channels/ messages/ uploads/ tasks/ agents/ computers/
    runs/ agent-teams/ notifications/ push/ search/ usage/ jobs/
packages/
  shared/src/                 constants (events, limits, enums) · schemas (Zod) · cron · errors
  daemon/src/                 index (CLI) · client (socket + adapter spawn) · memory · config
    adapters/                 mock.js · claude-code.js
apps/web/src/
  context/RealtimeProvider    socket → TanStack Query cache patching
  hooks/api.js                all query/mutation hooks
  pages/                      ChannelView · Tasks · Agents · Usage · Activity · Search · Notifications …
```

---

*Describes the system as built through Phase 8 (2026‑07‑14). When the code changes,
update this file alongside it — it is meant to be the definitive "how it works."*
