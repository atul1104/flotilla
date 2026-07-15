# PLAN.md — Multi-Agent Collaboration Platform

**Working codename: "Flotilla"** (placeholder — rename anytime; a flotilla is many rafts moving together).

A ground-up replication and improvement of [raft.build](https://raft.build/): a Slack-style workspace where **humans and AI agents work together as teammates** — channels, threads, DMs, tasks — with agents executing on the user's own hardware via a lightweight local daemon.

- **Frontend:** React, Tailwind CSS, Lucide React
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL
- **Builder:** Solo, full-time. Roadmap targets a usable private beta in ~4 months.

---

## 1. What Raft Is (Reference Product Analysis)

From raft.build and docs.raft.build, the product has four parts:

| Part | What it does |
|---|---|
| **Marketing site** (raft.build) | Hero, trust logos, 3 feature pillars, testimonials, team, pricing (Free / Pro $8.80/seat/mo / Enterprise), FAQ, footer |
| **Web app** (app.raft.build) | The workspace: servers (workspaces), channels, DMs, threads, tasks, @mentions, notifications, search, file uploads |
| **Daemon ("Computer")** | Lightweight local process on the user's machine. Runs agents close to the user's files, tools, and AI subscriptions (Claude, Codex, DeepSeek). Full privacy — code/data never leave the machine except chat messages |
| **Agents** | Persistent identities with their own memory, preferences, and past-conversation recall. They claim tasks, run in parallel, hand work to each other, and review each other's output in shared threads. Humans set direction and make final calls |

**Their three core pillars (we must nail all three):**
1. **Chat is the workspace** — every interaction happens in messages; humans and agents share the same context.
2. **Long-running agents** — each agent is a persistent process with its own memory; drop a task and it picks up where it left off.
3. **Your computers, your agents** — agents execute on your own hardware via a daemon; full compute control, full data privacy.

**Their pricing model (we replicate the shape, implement later):**
- Free: channels, tasks, agents on own computers, reminders, basic observability, 30-day history, 100 MB uploads/mo.
- Pro: $8.80/seat/mo annual. **1 seat per human, 0.1 seat per agent.** Unlimited history, higher upload limits, joint channels.
- Enterprise: private deployment, SSO, access control, onboarding support.

---

## 2. How We Improve on Raft

Replication gets us parity; these are the deliberate upgrades, tagged with the phase that ships them:

1. **Task board (Kanban) view** — Raft is chat-first; tasks live in conversation. We add a structured board (Backlog / Claimed / Running / Needs Review / Done) as a first-class view over the same data. *(Phase 3)*
2. **Cost & token observability dashboard** — per-agent and per-workspace tokens, run counts, durations, estimated spend, with daily charts. Raft's testimonial brags "1.2B tokens a day" — we let you *see and budget* that. *(Phase 6)*
3. **Approval policies (human-in-the-loop gates)** — per-agent/per-channel rules: e.g. "shell commands require approval," "file writes outside the project dir require approval." Run pauses, posts an approve/deny card in the thread, resumes on click. *(Phase 5)*
4. **Scheduled & recurring tasks** — cron-style: "every weekday at 9:00, summarize new GitHub issues." Raft only has "reminders." *(Phase 6)*
5. **Agent team templates** — one-click blueprints ("Research team," "Dev team: coder + reviewer + QA") that create pre-configured agents with roles and system prompts. *(Phase 6)*
6. **Inline artifact review** — code diffs, markdown docs, and images rendered in-thread with side-by-side review, instead of raw text dumps. *(Phase 5)*
7. **Open external-agent API** — documented webhook/WebSocket API so any third-party agent can join a channel as a member. Raft supports this but underdocuments it; we make it a first-class integration surface. *(Phase 7+)*
8. **PWA + push notifications** — installable mobile experience with web push, so "get pinged when it matters" works on phones without a native app. *(Phase 6)*
9. **Better onboarding** — guided first-run: create workspace → install daemon (one copy-paste command with pairing code) → first agent says hello → hand off a starter task. Measured funnel. *(Phase 4)*

---

## 3. Tech Stack (Locked Decisions)

| Layer | Choice | Notes |
|---|---|---|
| Language | **JavaScript (ESM, `"type":"module"`)** everywhere | **Locked: plain JS, no TypeScript.** Shared **Zod schemas** in `packages/shared` carry every contract across app/api/daemon at *runtime* — validation is now the primary shape layer, since there are no compile-time types. Add JSDoc on exported functions/schemas where editor hints pay off. The TS-flavoured interface sketches later in this doc (§7.3, §8.3) are *specification*, not literal code — implement them as JS + JSDoc. |
| Package manager | **npm (workspaces)** | **Locked: npm, not pnpm.** Root `package.json` declares `workspaces: ["apps/*", "packages/*"]`; `npm install` at root links everything, `npm run <script> --workspaces` runs across apps, `--workspace=<pkg>` targets one. **Turborepo dropped** for simplicity (solo dev — a root `dev` script via `concurrently` covers parallel watch; add turbo back only if builds get slow). |
| Frontend build | **Vite** + React 18 | SPA for the app; the landing site is a separate small Vite build (static output) |
| Styling | **Tailwind CSS v4** + Lucide React icons | Design tokens in CSS variables; dark mode via `class` strategy |
| Client state | **TanStack Query** (server cache) + **Zustand** (UI state) | No Redux; Query handles all API data, sockets patch its cache |
| Routing | **React Router v7** (library mode) | |
| API server | **Express 5** on Node 22 LTS | REST + Socket.IO in one process initially |
| Realtime | **Socket.IO** | Two namespaces: `/client` (browsers) and `/daemon` (computers). Node daemon uses socket.io-client |
| ORM / migrations | **Prisma** | Fast solo-dev DX, typed queries, migrate workflow. (Alternative: Drizzle if you prefer SQL-first) |
| Validation | **Zod** | Shared schemas in `packages/shared`, used by API, app, and daemon. **Primary contract layer** now that we ship plain JS — every request shape, socket payload, and config is a Zod schema (was a complement to TS types; now load-bearing). |
| Auth | Session cookies (httpOnly, `connect-pg-simple` store) for browsers; **revocable device tokens** for daemons | Google OAuth added in Phase 6 |
| File storage | Local disk (dev) → **S3-compatible** (Cloudflare R2/MinIO) with presigned uploads | |
| Search | **Postgres full-text search** (`tsvector` + GIN) | No Elasticsearch; upgrade path is pg_trgm, then external if ever needed |
| Jobs/schedules | **pg-boss** (Postgres-backed job queue) | Avoids adding Redis; handles retention cleanup, cron tasks, digests |
| Daemon | **Node CLI**, published as npm package (`npx flotilla-daemon`) | Spawns agent runtimes as child processes |
| Agent runtimes | Adapter interface. **Sole runtime:** `claude-code` (Claude Code headless — `claude -p --output-format stream-json`). **Future:** `openai-api` (OpenAI-compatible chat, no local tools), `anthropic-sdk` (direct Messages API, blocking approval gate) | This is exactly Raft's "bring your own subscription" model |
| Testing | **Vitest** (unit), **Supertest** (API), **Playwright** (E2E) | |
| Dev env | **Docker Compose** (Postgres, MinIO) | |
| Deploy | Single VPS or Railway/Render/Fly to start; Dockerized | Details §15 |

---

## 4. System Architecture

```
                                ┌─────────────────────────────┐
   ┌──────────────┐   HTTPS    │        API SERVER            │
   │  Landing site │──────────▶│  Express (REST /api/v1)      │
   │ (static, CDN) │           │  Socket.IO  /client /daemon  │      ┌──────────────┐
   └──────────────┘            │  pg-boss (jobs, cron, retention)◀──▶│  PostgreSQL  │
   ┌──────────────┐  REST + WS │                              │      └──────────────┘
   │   Web app     │◀─────────▶│  - Auth & sessions           │      ┌──────────────┐
   │  (React SPA)  │           │  - Channels/messages/tasks   │◀────▶│ S3 (files)   │
   └──────────────┘            │  - Agent orchestration       │      └──────────────┘
                               │  - Run event ingestion       │
                               └────────────▲─────────────────┘
                                            │ WSS (device token)
                     ┌──────────────────────┴──────────────────────┐
                     │            DAEMON ("Computer")               │
                     │  Node CLI on the user's machine              │
                     │  - pairs via one-time code                   │
                     │  - heartbeats → presence                     │
                     │  - receives agent invocations                │
                     │  - spawns runtime adapters (child processes) │
                     │  - streams run events back                   │
                     │  ~/.flotilla/agents/<agent>/  (home + memory)│
                     │     ├─ MEMORY.md, notes/                     │
                     │     └─ workspace/ (repos, files)             │
                     └──────────────────────────────────────────────┘
```

**Key architectural rules:**
- The server is the **source of truth for conversation, tasks, and run history**. The daemon is the **source of truth for agent working files and memory**. Code and data on the user's machine never transit the server unless an agent posts them as a message/attachment — this is the privacy pitch, preserve it.
- One Express process serves REST + Socket.IO initially. Scale path (later, not now): sticky sessions + Socket.IO Redis adapter, or split realtime into its own process.
- Every message, task change, and run event flows: **DB write → Socket.IO broadcast to workspace room → clients patch TanStack Query cache**. Never broadcast without persisting first.

---

## 5. Monorepo Layout

npm workspaces (locked in §3). Turborepo dropped for simplicity.

```
flotilla/
├─ apps/
│  ├─ landing/        # Marketing site (Vite + React, static output)
│  ├─ web/            # The workspace SPA
│  └─ api/            # Express server
│     ├─ src/
│     │  ├─ modules/  # auth/ workspaces/ channels/ messages/ tasks/
│     │  │           # agents/ computers/ runs/ notifications/ search/ billing/
│     │  ├─ realtime/ # socket namespaces, event contracts
│     │  ├─ jobs/     # pg-boss workers (retention, cron tasks, digests)
│     │  └─ lib/      # db, storage, mailer, logger
│     └─ prisma/      # schema.prisma + migrations
├─ packages/
│  ├─ shared/         # Zod schemas, TS types, socket event names, constants
│  └─ daemon/         # published CLI: pairing, runtime adapters, event streaming
├─ docker-compose.yml # postgres + minio (+ mailpit for email dev)
└─ PLAN.md
```

Module pattern inside `api`: each module = `router.js` (Express routes) + `service.js` (business logic) + `schema.js` (Zod). Routes stay thin; services are unit-testable. *(Was `.ts` — now `.js` per the locked JS decision, §3.)*

---

## 6. Database Schema

Design principle: humans and agents are both "actors" so messages, tasks, mentions, and reactions reference **one** table. This avoids polymorphic `sender_type/sender_id` pairs everywhere.

```sql
-- ============ Identity ============
users(
  id uuid PK, email citext UNIQUE, password_hash text NULL,  -- NULL if OAuth-only
  name text, avatar_url text, email_verified_at timestamptz,
  created_at, updated_at
)

actors(                    -- unified identity for humans AND agents
  id uuid PK,
  kind text CHECK (kind IN ('user','agent')),
  user_id uuid NULL REFERENCES users,      -- exactly one of these set
  agent_id uuid NULL REFERENCES agents
)

-- ============ Workspaces ============
workspaces(
  id uuid PK, name text, slug citext UNIQUE, owner_id uuid REFERENCES users,
  plan text DEFAULT 'free',               -- 'free' | 'pro' | 'enterprise'
  settings jsonb DEFAULT '{}', created_at
)
workspace_members(
  workspace_id uuid, actor_id uuid REFERENCES actors,
  role text CHECK (role IN ('owner','admin','member','agent')),
  joined_at, PRIMARY KEY (workspace_id, actor_id)
)
invites(id uuid PK, workspace_id, email citext, role text, token text UNIQUE,
        invited_by uuid, expires_at, accepted_at)

-- ============ Computers & Agents ============
computers(
  id uuid PK, workspace_id, owner_user_id uuid REFERENCES users,
  name text, platform text, daemon_version text,
  status text DEFAULT 'offline',           -- 'online' | 'offline'
  last_seen_at timestamptz, created_at
)
device_tokens(                             -- daemon auth; token stored hashed
  id uuid PK, computer_id uuid REFERENCES computers,
  token_hash text, created_at, revoked_at timestamptz NULL
)
agents(
  id uuid PK, workspace_id, name text, handle citext,   -- @handle, unique per ws
  avatar_url text, tagline text,
  system_prompt text, runtime text,        -- 'claude-code' | 'openai-api' | ...
  model text, computer_id uuid NULL REFERENCES computers,
  approval_policy jsonb DEFAULT '{}',      -- improvement #3: tool gates
  status text DEFAULT 'idle',              -- 'idle'|'running'|'offline'
  created_by uuid, created_at,
  UNIQUE (workspace_id, handle)
)

-- ============ Channels & Messages ============
channels(
  id uuid PK, workspace_id, name citext, topic text,
  kind text CHECK (kind IN ('public','private','dm')),
  created_by uuid REFERENCES actors, archived_at, created_at,
  UNIQUE (workspace_id, name)
)
channel_members(channel_id, actor_id, last_read_message_id uuid NULL,
                notify_level text DEFAULT 'mentions', PRIMARY KEY (channel_id, actor_id))
messages(
  id uuid PK, channel_id uuid, sender_id uuid REFERENCES actors,
  thread_root_id uuid NULL REFERENCES messages,  -- NULL = top-level
  content text,                                  -- markdown
  payload jsonb NULL,          -- structured cards: task refs, approval requests, artifacts
  run_id uuid NULL,            -- set when authored by an agent run
  created_at, edited_at, deleted_at,
  search_tsv tsvector GENERATED  -- GIN index for search
)
attachments(id uuid PK, message_id, uploader_id uuid, filename text, mime text,
            size_bytes bigint, storage_key text, created_at)
reactions(message_id, actor_id, emoji text, PRIMARY KEY (message_id, actor_id, emoji))
mentions(message_id, mentioned_actor_id, PRIMARY KEY (message_id, mentioned_actor_id))

-- ============ Tasks ============
tasks(
  id uuid PK, workspace_id, channel_id uuid NULL,   -- channel it was created in
  title text, description text,
  status text CHECK (status IN ('backlog','claimed','running','needs_review','done','cancelled')),
  priority int DEFAULT 2,
  created_by uuid REFERENCES actors, assignee_id uuid NULL REFERENCES actors,
  parent_task_id uuid NULL REFERENCES tasks,        -- subtasks / handoffs
  root_message_id uuid NULL,                        -- thread where work happens
  due_at timestamptz NULL,
  schedule jsonb NULL,        -- improvement #4: {cron:"0 9 * * 1-5", tz:"..."}
  created_at, updated_at, completed_at
)
task_events(id, task_id, actor_id, type text, payload jsonb, created_at)  -- audit trail

-- ============ Agent Runs (observability core) ============
agent_runs(
  id uuid PK, agent_id, computer_id, workspace_id,
  task_id uuid NULL, trigger_message_id uuid NULL,
  status text CHECK (status IN ('queued','dispatched','running',
                                'awaiting_approval','succeeded','failed','cancelled')),
  model text, tokens_in bigint DEFAULT 0, tokens_out bigint DEFAULT 0,
  cost_estimate_cents int NULL, error text NULL,
  queued_at, started_at, finished_at
)
run_events(                    -- streamed from daemon; powers live "thinking" UI
  id bigserial PK, run_id uuid, seq int,
  type text,                   -- 'status'|'thinking'|'tool_use'|'tool_result'
                               -- |'approval_request'|'chunk'|'final'
  payload jsonb, created_at,
  UNIQUE (run_id, seq)
)
approvals(id uuid PK, run_id, message_id,          -- the approve/deny card
          requested_action jsonb, decided_by uuid NULL,
          decision text NULL CHECK (decision IN ('approved','denied')), decided_at)

-- ============ Notifications ============
notifications(id uuid PK, user_id, type text,       -- mention|task|approval|run_done|invite
              payload jsonb, read_at timestamptz NULL, created_at)
push_subscriptions(id, user_id, endpoint text, keys jsonb, created_at)  -- web push

-- ============ Billing (schema now, Stripe later — Phase 7) ============
subscriptions(id uuid PK, workspace_id UNIQUE, stripe_customer_id text,
              stripe_subscription_id text, plan text, seats numeric,
              billing_cycle text, current_period_end, status text)
usage_counters(workspace_id, period date, uploads_bytes bigint,
               messages_count bigint, PRIMARY KEY (workspace_id, period))
```

**Plan limits enforced from day one** (values from a `PLAN_LIMITS` constant in `packages/shared`, so flipping a workspace to Pro is a data change, not a code change):
- Free: message history reads capped at 30 days (data retained, gated on query — instant unlock on upgrade), 100 MB uploads/month, max 3 agents.
- Pro/Enterprise: unlimited history, higher caps.
- Seat math: `seats = humans * 1 + agents * 0.1` computed nightly into `subscriptions.seats`.

---

## 7. API Design

REST under `/api/v1`, JSON, Zod-validated. Cookie session auth for browsers, `Authorization: Bearer <device-token>` for daemons. Cursor pagination (`?cursor=&limit=`) everywhere lists exist.

### 7.1 REST Endpoints

```
Auth        POST /auth/signup | /auth/login | /auth/logout
            GET  /auth/me
            POST /auth/verify-email | /auth/forgot-password | /auth/reset-password

Workspaces  POST /workspaces                      GET /workspaces
            GET|PATCH /workspaces/:id             GET /workspaces/:id/members
            POST /workspaces/:id/invites          POST /invites/:token/accept

Computers   POST /workspaces/:id/computers/pairing-code   -- returns one-time code
            POST /daemon/pair {code}              -- daemon exchanges code → device token
            GET  /workspaces/:id/computers        DELETE /computers/:id (revoke)

Agents      POST /workspaces/:id/agents           GET /workspaces/:id/agents
            GET|PATCH|DELETE /agents/:id
            POST /agents/:id/test                 -- fire a hello-world run

Channels    POST /workspaces/:id/channels         GET /workspaces/:id/channels
            GET|PATCH /channels/:id               POST /channels/:id/members
            DELETE /channels/:id/members/:actorId
            POST /workspaces/:id/dms {actorIds[]} -- find-or-create DM

Messages    GET  /channels/:id/messages?cursor=   -- newest-first pages
            POST /channels/:id/messages {content, threadRootId?, attachmentIds?}
            PATCH|DELETE /messages/:id
            GET  /messages/:id/thread
            POST /messages/:id/reactions

Files       POST /uploads/presign {filename,mime,size} → {uploadUrl, storageKey}
            POST /uploads/complete

Tasks       POST /workspaces/:id/tasks            GET /workspaces/:id/tasks?status=&assignee=
            GET|PATCH /tasks/:id                  POST /tasks/:id/claim
            POST /tasks/:id/handoff {toActorId}   POST /tasks/:id/complete

Runs        GET /agents/:id/runs                  GET /runs/:id  (+ events)
            POST /runs/:id/cancel
            POST /approvals/:id/decide {decision}

Search      GET /workspaces/:id/search?q=&type=messages|tasks|files

Notifs      GET /notifications                    POST /notifications/read {ids[]}
            POST /push/subscribe

Usage       GET /workspaces/:id/usage             -- observability dashboard data
```

### 7.2 Socket.IO — `/client` namespace (browsers)

On connect: authenticate via session → join rooms `ws:<workspaceId>` and `user:<userId>`.

```
Server → client:
  message.created / message.updated / message.deleted
  reaction.added / reaction.removed
  channel.created / channel.updated / member.joined / member.left
  task.created / task.updated
  run.started / run.event (throttled stream) / run.finished
  agent.status  / computer.status          -- presence
  approval.requested / approval.decided
  notification.created
  typing  (ephemeral, not persisted)

Client → server:
  typing.start {channelId}
  channel.read {channelId, messageId}       -- read cursors
```

### 7.3 Socket.IO — `/daemon` namespace (computers)

Authenticate with device token → joins `computer:<id>`, marks computer online, heartbeat every 20 s (missed 2 → offline, agents on it shown offline).

```
Server → daemon:
  run.dispatch {
    runId, agent: {id, handle, systemPrompt, runtime, model, approvalPolicy},
    context: {                       -- assembled by the server
      channel, task,
      recentMessages[],              -- last N thread/channel messages, rendered
      mentionsOfAgent[]
    }
  }
  run.cancel {runId}
  approval.decision {runId, approvalId, decision}
  agent.sync {agent}                 -- profile/prompt changed

Daemon → server:
  run.event {runId, seq, type, payload}     -- ordered, ack'd, resumable by seq
  run.message {runId, content, payload?}    -- agent posts into the thread
  run.finished {runId, status, usage:{tokensIn, tokensOut}}
  agent.register / computer.info
```

Delivery rule: daemon buffers events on disk until ack'd; on reconnect it replays from last ack'd seq. Server dedupes on `(run_id, seq)`. Runs survive laptop-lid-close gracefully (run marked `failed: computer offline` after a timeout, retryable).

---

## 8. Agent Execution Model (the heart of the product)

### 8.1 Daemon lifecycle

```bash
npx flotilla-daemon start        # first run: prompts for pairing code from web UI
```
1. User clicks "Add a computer" in the app → gets a one-time pairing code.
2. Daemon exchanges code for a device token (stored in `~/.flotilla/config.json`, hashed server-side).
3. Daemon connects to `/daemon` namespace, registers platform info, goes online.
4. Runs as a foreground process (v1); `--install-service` for launchd/systemd in Phase 6.

### 8.2 Agent home & memory (the "persistent process" pillar)

```
~/.flotilla/agents/<handle>/
├─ AGENT.md        # identity: role, standing instructions (synced from server)
├─ MEMORY.md       # long-term memory the agent maintains itself
├─ notes/          # scratch files the agent keeps between runs
└─ workspace/      # working dir: repos, documents, artifacts
```

"Memory" is deliberately simple in v1: the runtime is instructed to read `MEMORY.md` at run start and update it at run end. This is exactly how Claude Code memory works and is Raft-equivalent. Fancier retrieval (embeddings) is a non-goal until proven necessary.

### 8.3 Runtime adapter interface

```ts
interface RuntimeAdapter {
  startRun(input: {
    agentDir: string;
    systemPrompt: string;
    context: string;                        // rendered conversation + task
    model: string;
    onEvent: (e: RunEvent) => void;         // thinking, tool_use, chunks
    requestApproval: (action: ToolAction) => Promise<'approved'|'denied'>;
  }): RunHandle;                            // { cancel(): void }
}
```

- **`claude-code` adapter (sole runtime):** drives Claude Code headless (Agent SDK / `claude -p --output-format stream-json`) with `cwd = agent workspace`, mapping its permission callback to `requestApproval` (this single hook implements improvement #3 for free). An *agentic* runtime — model + tool loop + file/bash access live inside `claude`; the adapter just spawns it and streams events. Requires the `claude` CLI on PATH + valid credentials.
- **Removed adapters:** `mock` (scripted, no keys) and `codex` (OpenAI coding-agent CLI) were removed to keep the runtime surface single-vendor. The `mock` runtime was previously the default + CI path; `claude-code` is now the default. E2E tests drive runs via scripted daemon sockets and never invoke the adapter, so CI remains key-free.
- **Future adapters (not built):** `openai-api` (generic OpenAI-compatible chat API — for non-coding chat/research/summary agents; no local tool use), `anthropic-sdk` (drive the Messages API directly so `requestApproval` actually *blocks* the tool, retiring the `canUseTool`-hook TODO in the adapter header).
- Concurrency: daemon runs up to N runs in parallel (default 2, configurable); one run per agent at a time — extra triggers queue server-side.

### 8.4 What triggers a run

1. **@mention** of an agent in a channel/thread it belongs to.
2. **Task assignment or claim** — agent works in the task's thread.
3. **DM** to the agent.
4. **Schedule** fires (improvement #4, via pg-boss cron).
5. **Handoff** — an agent's run output includes a structured handoff (`@other-agent please review …`) → server creates a subtask + triggers the other agent. **This is the multi-agent magic and it needs no special machinery** — it's just mentions + tasks composing.

Loop safety: max agent-to-agent chain depth (default 5) and per-workspace hourly run cap; both configurable. An agent never triggers itself.

### 8.5 Run flow, end to end

```
@mention → API creates agent_run(queued) → is agent's computer online?
  ├─ no  → post "🖥️ offline" note in thread; run stays queued 15 min, then fails
  └─ yes → run.dispatch → daemon spawns adapter
            → run.event stream → server persists run_events
              → broadcasts throttled run.event to clients (live activity UI)
            → tool gate hit? → approvals row + card message in thread
              → human decides → approval.decision → adapter resumes
            → run.message → persisted as a normal message from the agent actor
            → run.finished → usage recorded → task status auto-updates
```

---

## 9. Frontend — Web App (`apps/web`)

### 9.1 Routes

```
/login /signup /invite/:token /forgot-password
/onboarding                        # guided: workspace → computer → first agent → first task
/:workspaceSlug
  /channels/:channelId             # main chat view
    ?thread=:messageId             # thread side panel
  /dms/:channelId
  /tasks                           # board (kanban) + list toggle   [improvement #1]
  /tasks/:taskId
  /agents  /agents/:agentId        # profile, memory peek, run history, settings
  /computers
  /activity                        # cross-workspace run feed
  /usage                           # tokens & cost dashboard        [improvement #2]
  /search?q=
  /settings/{profile,workspace,members,billing,notifications}
```

### 9.2 Layout & key components

Classic three-pane chat layout:

```
┌────┬──────────────┬──────────────────────────────┬─────────────┐
│ WS │  Sidebar      │  Message pane                 │ Thread panel │
│rail│  channels     │  virtualized list             │ (contextual) │
│    │  DMs          │  markdown + code highlight    │ or task/agent│
│    │  agents (●)   │  agent "live activity" strip  │ details      │
│    │  tasks        │  composer (mentions, files)   │              │
└────┴──────────────┴──────────────────────────────┴─────────────┘
```

Components worth planning explicitly:
- **MessageList** — virtualized (`@tanstack/react-virtual`), day dividers, unread line, grouped consecutive messages.
- **Composer** — textarea with `@mention` autocomplete (humans + agents visually distinct), file drop, slash-commands later.
- **AgentMessage** — agent avatar + runtime badge; expandable **RunActivity** accordion showing live thinking/tool-use events while a run streams.
- **ApprovalCard** — rendered from `message.payload`; Approve/Deny buttons, shows requested action (e.g. the shell command).
- **ArtifactViewer** — diff view, markdown render, image preview in-thread (improvement #6).
- **TaskCard / TaskBoard** — drag between columns (assignee avatars: human or agent).
- **PresenceDot** — agent online = its computer online.
- **UsageDashboard** — charts for tokens/cost/runs (Recharts).

### 9.3 State & data flow

- TanStack Query for everything from REST; Socket.IO events **patch the query cache** (e.g. `message.created` appends into the channel's infinite query) — no duplicated stores.
- Zustand for pure UI state: open panels, composer drafts, theme.
- Optimistic sends: message appears instantly with a client nonce → reconciled by server echo.
- Design system: Tailwind tokens (`--color-*`, spacing, radius) defined once in `packages/shared` styles; Lucide icons only (consistent 20px/1.5px stroke); light/dark from day one. Aesthetic direction: clean brutalist-leaning like Raft — sharp corners, visible borders, monospace accents for agent/technical elements.

## 10. Frontend — Landing Site (`apps/landing`)

Static Vite+React build, deployed to CDN. Replicates raft.build's structure, section by section (§1), with our copy:

1. Nav (Pricing, Docs, Blog, Sign in) → 2. Hero with **animated product mock** — a fake channel where two agents visibly hand off a task (their static screenshot, improved) → 3. Trust/logos strip (placeholder initially) → 4. Three feature pillars → 5. How-it-works (install daemon → agents come alive; 3 steps with code snippet) → 6. Testimonials (collect during beta) → 7. Pricing (3 tiers, monthly/yearly toggle) → 8. FAQ (accordion; include the "how is this different from Slack / Claude Code / runtimes" comparisons — Raft's FAQ positioning is genuinely good, emulate it) → 9. Final CTA → 10. Footer.

SEO basics: meta/OG tags, sitemap, per-section anchors. Blog/docs: defer to Phase 6+ (Astro or Fumadocs when needed; don't build a CMS).

---

## 11. Auth & Security

- **Passwords:** argon2id. Sessions: httpOnly, Secure, SameSite=Lax cookies, Postgres-backed, 30-day rolling. CSRF: SameSite + custom-header check on mutations.
- **Device tokens:** 256-bit random, stored hashed (sha256), shown once at pairing, revocable per computer from the UI ("Revoke" = daemon disconnects immediately).
- **Tenant isolation:** every query scoped by `workspace_id`; membership middleware on every route (`requireWorkspaceMember`, `requireChannelMember`). Test this explicitly — it's the #1 bug class in chat apps.
- **Uploads:** presigned PUT (size/mime-limited), private bucket, signed GET URLs, per-plan monthly quota from `usage_counters`.
- **Agent safety:** approval policies default-on for shell/file-write outside agent workspace; run chain-depth cap; per-workspace run rate cap; agents can only see channels they're members of (context assembly respects membership — an agent mentioned in a private channel it's not in gets nothing).
- **Rate limiting:** per-IP on auth routes, per-user on message send (also throttles runaway agents).
- Zod-validate every input; markdown rendered with sanitization (no raw HTML); CSP headers on both apps.

---

## 12. Billing Design (implement in Phase 7)

- Stripe Checkout + customer portal (no custom card UI). Products: Pro monthly / Pro yearly (12% off).
- Seat-based: nightly job computes `humans + 0.1 × agents`, updates the Stripe subscription quantity (proration on).
- Webhooks: `checkout.session.completed`, `customer.subscription.updated/deleted` → flip `workspaces.plan`.
- Grace on downgrade: history gating resumes, over-limit agents pause (never delete data).
- Everything before Phase 7 runs on `plan='free'` with generous dev-time limits.

---

## 13. Testing Strategy

- **Unit (Vitest):** services (task lifecycle, seat math, plan limits, context assembly), daemon adapter parsing, shared Zod schemas.
- **API (Supertest + test Postgres in Docker):** auth flows, tenant isolation (the critical suite: user A must never read workspace B), message/task CRUD, pagination.
- **Realtime:** integration tests with two socket clients + a fake daemon client asserting the event contracts in §7.2/7.3.
- **Daemon:** E2E tests drive runs via scripted daemon sockets (they emit run events directly, never invoking the `claude-code` adapter), so CI never needs real AI keys; one manual smoke script runs a real Claude Code hello-world.
- **E2E (Playwright):** the golden path — signup → create workspace → pair fake daemon → create agent → @mention it → see streamed reply → task board updates. Run on CI against compose.
- CI: GitHub Actions — lint, unit, API, E2E on PR. No `tsc` step (plain JS): **ESLint is the static-analysis gate**; Zod schemas catch shape errors at runtime in tests.

## 14. DevOps & Deployment

- **Dev:** `docker compose up` (Postgres, MinIO, Mailpit) + `npm run dev` (root script runs api/web/landing concurrently with HMR). Seed script creates demo workspace, users, an agent, and fake run history.
- **Prod v1 (beta):** one Docker image for the API (serves the built SPA too, or SPA on a CDN), managed Postgres (Neon/Supabase/RDS), R2 for files. Host: Railway/Render/Fly or a single VPS with Caddy. Socket.IO needs sticky sessions only when we scale past one instance — not a beta concern.
- **Domains:** `flotilla.dev` (landing), `app.…`, `api.…`.
- Observability: pino logs, Sentry (API + web), simple uptime check. Backups: managed-PG daily snapshots.
- Daemon distribution: npm publish; version handshake on connect (server can flag "daemon update available").

---

## 15. Roadmap — Phases & Milestones (solo, full-time)

Estimates include testing. **Ship order optimizes for the demo moment: an agent answering in a channel (end of Phase 4) — everything before it is the shortest path there.**

### Phase 0 — Foundations (Week 1)
Monorepo (npm workspaces), JS/ESM + ESLint configs, Docker Compose, Prisma + initial migration (users → messages tables), Express skeleton with error handling/logging, CI pipeline, seed script.
**Done when:** `npm run dev` boots everything; CI green.

### Phase 1 — Auth + Workspace shell (Weeks 2–3)
Signup/login/sessions, email verify (Mailpit dev), workspaces, invites, members; web app shell (routing, sidebar, theme, settings pages).
**Done when:** two real users share a workspace via invite link.

### Phase 2 — Chat core (Weeks 4–6) ⚠️ biggest UI phase
Channels (public/private/DM), messages + threads + reactions + mentions, Socket.IO client namespace, virtualized message list, composer with autocomplete, uploads (presign→MinIO), read cursors + unread badges, typing indicators.
**Done when:** two browsers chat in real time with threads and files; refresh loses nothing.

### Phase 3 — Tasks (Weeks 7–8)
Task CRUD bound to threads, status lifecycle, claim/assign/handoff, **Kanban board + list views** (improvement #1), task cards in chat (`payload` messages), task audit trail.
**Done when:** create task in chat → drag it on the board → thread reflects every change.

### Phase 4 — Daemon + first agent (Weeks 9–11) ⚠️ the hard one
Computers + pairing flow, device tokens, `/daemon` namespace with heartbeats/presence, daemon CLI (pair, connect, reconnect+replay), `claude-code` runtime adapter, run dispatch + event streaming + live RunActivity UI, agent CRUD + profiles, **onboarding flow** (improvement #9).
**Done when (🎉 the demo):** `@researcher summarize this thread` → agent on your laptop streams a reply into the channel.

### Phase 5 — Multi-agent collaboration (Weeks 12–13)
Agent→agent mentions and handoffs (chain-depth caps), task claim by agents, **approval gates** (improvement #3) with ApprovalCard flow, **artifact review** (improvement #6), run cancel/retry, agent memory read/write conventions hardened.
**Done when:** coder-agent writes code → hands to reviewer-agent → reviewer requests your approval before running tests.

### Phase 6 — Notifications, search, observability (Weeks 14–15)
Notification center + web push + PWA manifest (improvement #8), mention/task/approval emails (digest), Postgres FTS across messages/tasks/files, **usage & cost dashboard** (improvement #2), **scheduled tasks** (improvement #4), **agent team templates** (improvement #5), daemon `--install-service`.
**Done when:** phone gets a push when an agent needs approval; dashboard shows yesterday's token spend.

### Phase 7 — Billing + landing site (Weeks 16–17)
Stripe (Checkout, portal, webhooks, seat sync per §12), plan-limit enforcement flips on for real, **landing site** built and deployed (§10), legal pages (privacy/ToS).
**Done when:** a stranger can visit the landing page, sign up, upgrade to Pro, and pay.

### Phase 8 — Hardening + private beta (Week 18+)
Security pass (§11 checklist as an audit), load sanity test (~50 concurrent users, 10 daemons), Sentry triage, onboarding funnel metrics, seed 5–10 beta teams, collect testimonials for the landing page.

**Total: ~18 weeks to public-ready beta.** Aggressive but honest for solo full-time — the two ⚠️ phases carry the schedule risk.

---

## 16. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Daemon reliability** (sleep, NAT, flaky Wi-Fi) is the hardest engineering problem here | Disk-buffered event queue + seq-based replay (§7.3); aggressive reconnect; runs fail loudly and retryably, never silently |
| Claude Code CLI/SDK interface changes under us | Adapter interface isolates it; pin versions; E2E tests use scripted daemon sockets, not the real adapter, so CI stays vendor-independent |
| Runaway agent loops burn users' tokens | Chain-depth cap, hourly run caps, one-run-per-agent, cost dashboard makes spend visible |
| Chat UI scope creep (Slack took years) | Ruthless v1 cut: no voice/huddles, no custom emoji, no message forwarding, no apps directory |
| Solo burnout / phases slip | Each phase ends demoable; if Phase 4 slips, everything after shifts — never work on two phases at once |
| Raft ships faster than we build | Differentiators (§2) are chosen to be cheap-but-visible; beta users early (Phase 8) validate direction |
| Privacy promise broken by accident (agent leaks local file into chat) | Agents only post what the runtime explicitly outputs; approval gates on reads outside workspace dir (configurable) |

## 17. Open Questions (answer before their phase starts)

1. **Product name + domain** — needed by Phase 7 (landing), nice-to-have sooner for the npm daemon package name.
2. Which second runtime matters more to you: OpenAI-compatible API or Codex CLI? (Phase 5/6 slot.) > not sure, suggest me.
3. Landing-site copy voice: Raft leans playful/builder-culture ("Build with fun") — match that, or more professional? > Build with fun
4. Beta distribution: open waitlist vs. hand-picked teams? > hand-picked teams
5. Enterprise/SSO: genuinely deferred until a real customer asks. Agreed? >agreed

---

*Sources for the product analysis: [raft.build](https://raft.build/) and [docs.raft.build](https://docs.raft.build/), reviewed 2026-07-10.*
