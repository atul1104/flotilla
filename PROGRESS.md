# PROGRESS.md — Flotilla Build Log

Implementation journal for the plan in [`PLAN.md`](./PLAN.md). Append a dated entry per working session. Each phase entry lists what was built, how it was verified, and any deviations from the plan.

**Legend:** ✅ done · 🟡 in progress · ⬜ not started · ⚠️ deviation/blocker

---

## Environment notes (2026-07-12)

- Working dir: `/Users/moofwd/Documents/raft` (folder named `raft`; project codename **Flotilla**, package names `@flotilla/*`).
- Local Node **v20.19.4** (plan §3 targets Node 22 LTS). Express 5 / Prisma / Vite all run on Node 20; `engines` set to `>=20`. Upgrade to 22 on the build host before beta — tracked in Phase 8.
- Toolchain present: npm 10.8.2, git 2.50, Docker 27.4 + Compose v2.31.
- Ultracode session: phase work driven directly (foundational scaffolding is tightly coupled); workflows used at phase boundaries for verification/review.

---

## Landing — Testimonials section ✅ (2026-07-14)

_Goal: ship real testimonials on the landing site (Phase 8 beta collection; the full landing is deferred Phase 7). — **MET (copy + UI + wired live).**_

### Built
- **Brought `apps/landing` onto the brand stack** (was a Phase-0 stub): Tailwind v4 (`@tailwindcss/vite`) + `lucide-react`; `src/index.css` mirrors the web app's design tokens (brutalist: sharp corners, visible borders, mono accents, brand `#ff5c35`, light/dark via `.dark` class). Inter + JetBrains Mono loaded.
- **Testimonials data** (`apps/landing/src/data/testimonials.js`): single source of truth — 10 hand-written testimonials, one featured. Each maps to a real differentiator (PLAN.md §2): task board, cost/token observability, approval gates, long-running memory, on-machine privacy, inline artifact review, scheduled tasks, agent-team templates, push/PWA, multi-agent collaboration. Representative beta personas — swap in real attribution as the beta collects them.
- **`<Testimonials/>` section**: featured lead quote + responsive brutalist grid (touching cells share 1px borders), per-card feature tags + optional metric badges, mono initials avatars.
- **Page shell** (`App.jsx` + `ThemeToggle.jsx`): sticky nav (wordmark, theme toggle, "Open the app" CTA) + footer. Hero/pricing/FAQ remain Phase 7. Theme set pre-paint from `localStorage` / `prefers-color-scheme` / `?theme=light|dark`; toggle persists.

### Verified
- `npm run build --workspace @flotilla/landing` ✅ (CSS 13 kB / JS 157 kB · gzip 51 kB).
- `npm run lint` ✅ (0 errors; the 2 remaining warnings are pre-existing in `sw.js`/`daemon`) · `npm run format:check` ✅.
- Visual: headless-Chrome screenshots confirm light, dark, and mobile (390 px) render on-brand and responsive.

### Deviations / notes
- ⚠️ Pulls a slice of Phase 7 (landing) forward early — the testimonials surface only; hero/pricing/FAQ/legal still deferred to Phase 7 with Stripe.
- Personas are representative, not yet real beta users (the hand-picked beta is the intended source). The data file is the single place to update as real quotes arrive.
- `APP_URL` (the "Open the app" CTA) defaults to the local web app (`localhost:5173`); set `VITE_APP_URL` for prod (e.g. `https://app.flotilla.dev`).
- Found en route: the **dev DB carries ~925 workspaces of test residue** under the demo seed (test fixtures like "Chat Co"/"Victim Co" — the suite deletes test *users* but leaves orphaned *workspaces*, accumulating across runs). Harmless for tests; a reset → demo + fresh beta seed is recommended before any real demo/beta. Pending owner decision.

---

## Phase 8 — Hardening + private beta ✅ (2026-07-13)

_Goal: security pass, load sanity, beta readiness. — **MET (all hardening done; load script + beta seed provided).**_

Phase 7 (Stripe/landing/legal) **deferred** per the hand-picked-beta choice — no strangers, no money yet. Plan-limit enforcement (the latent Phase 7 gap) folded in here.

### Built
- **Plan-limit enforcement** (the real gap — `PLAN_LIMITS` was defined but never used): `lib/limits.js` centralizes the rules. Free = 3 agents (`assertAgentCap` → 402), 30-day message history gate (`historyCutoff` applied in `listMessages` — data retained, read gated), 100 MB/mo upload quota (`assertUploadQuota` in `createPresign`). Uploads are now workspace-scoped (`POST /workspaces/:id/uploads/presign`) so the quota knows the workspace + plan. `PaymentRequiredError` (402) added to shared.
- **Markdown sanitization** (highest-value security): `rehype-sanitize` on MessageItem + ArtifactViewer — message markdown can no longer inject `<img onerror=…>` / scripts.
- **CSRF hardening**: removed `express.urlencoded` (nothing used it) + explicit JSON-content-type check on mutations (415 on non-JSON) — a cross-origin form POST can't set `content-type: application/json`, closing the CSRF surface with SameSite=Lax.
- **CSP**: explicit prod CSP via Helmet (`connect-src` covers API + Socket.IO ws; `img-src` data/blob; `script-src` self).
- **Virtualized message list**: `@tanstack/react-virtual` with dynamic measurement; day dividers folded into the row stream. Matters at the load-test scale.
- **Code-split bundle**: manualChunks (recharts, markdown, query, router, socket) + lazy-loaded Usage/Activity/Search. Initial gzip **~143 kB** (was 293 kB); Recharts (393 kB) + markdown (162 kB) load only when used.
- **Sentry**: `@sentry/node` (API, init in server.js, 500s captured in error handler) + `@sentry/react` (web, ErrorBoundary in main.jsx). No-op without `SENTRY_DSN`.
- **Onboarding funnel**: `workspace.settings.onboarding` counters (workspace_created → computer_paired → first_agent → first_run), marked at the natural points, `GET /workspaces/:id/onboarding`.
- **Deeper health**: `GET /health` now reports DB + pg-boss + push state.
- **Beta seed** (`prisma/seed-beta.js [N]`): N workspaces, each with humans + agents + computer + a week of run history. Idempotent.
- **Load sanity script** (`scripts/load-test.mjs [clients] [daemons]`): 50 socket clients + 10 daemons, posts messages, reports p50/p95 latency + dropped events. Manual, not CI.

### Verified
- `npm test` ✅ **92/92** (shared 24, api 92 incl. **14 new Phase-8 tests**: plan limits [agent cap 402, history gate, upload quota], CSRF 415, security headers, onboarding funnel). Existing suites unchanged.
- `npm run lint` ✅ (0 errors, 2 pre-existing warnings) · `npm run format:check` ✅ · web build ✅ · beta seed ✅.

### Deviations / notes
- ⚠️ **Uploads became workspace-scoped** (`/workspaces/:id/uploads/presign`) — the old `/uploads/presign` couldn't enforce the quota without knowing the workspace. Frontend updated.
- ⚠️ **Phase 6 tests bumped to `plan:'pro'`** so the agent-team + usage tests aren't blocked by the now-enforced Free 3-agent cap (those tests aren't about the cap; Phase 8 covers it).
- Load script measures broadcast latency from REST post → socket echo; a full daemon load test needs real pairing (documented in the script).
- Sentry SDKs installed but inert without `SENTRY_DSN` — zero cost in dev/test.
- Virtualization uses dynamic measurement (`measureElement`) so variable-height messages (artifacts, approval cards) render correctly.

---

## Phase 6 — Notifications, search, observability ✅ (2026-07-13)

_Goal: phone gets a push when an agent needs approval; dashboard shows yesterday's token spend. — **MET (all surfaces built + wired end-to-end).**_

### Built
- **Backend (already present from prior session, verified + hardened here):** migration `add_phase6_notifications_push_usage_fts` (notifications, push_subscriptions, usage_counters, subscriptions, messages `search_tsv` tsvector + GIN). Modules: `notifications` (create/list/markRead + `notifyMention`/`notifyApprovalRequested`/`notifyRunFinished` wired into messages + runs), `push` (VAPID + subscribe/unsubscribe + sendPush with dead-endpoint pruning), `search` (Postgres FTS over messages + ILIKE tasks/files, workspace-scoped), `usage` (totals + byDay + byAgent cost/token aggregation), `jobs` (pg-boss: scheduled-task tick + daily digest + retention; pure `cron.js` matcher in shared), `agent-teams` (research/dev/support templates, handle-conflict suffixing). Daemon `install-service` (launchd/systemd). Schedule field on tasks (`scheduleSchema` with cron validation).
- **Frontend (new this session):**
  - **Usage dashboard** (`/usage`) — Recharts: tokens-per-day line chart, cost-per-day bar chart, per-agent breakdown table, 7/30/90d window selector, totals cards. Nav: Usage.
  - **Activity feed** (`/activity`) — cross-workspace run list with status/trigger/chain-depth/tokens/retry. New `GET /workspaces/:id/runs` endpoint (membership-guarded) + `useWorkspaceRuns` hook. Nav: Activity.
  - **Notifications page** (`/notifications`) — full list + mark-read. **NotificationBell** mounted in a new AppLayout top bar. Nav + bell link here.
  - **Search** (`/search` page + **⌘K SearchBar** palette in the top bar) — FTS results across messages/tasks/files via `useSearch`. Nav: Search.
  - **Agent team templates** — one-click section on the Agents page (`useTeamTemplates`/`useCreateTeam`): pick an online computer, create research/dev/support teams.
  - **Schedule (cron) UI** — optional cron + tz fields in the task create dialog; schedule shown on the task detail modal.
  - **Push opt-in** — Notifications section in Settings with "Enable push notifications" → `enablePush()` (SW + VAPID + PushManager); granted/denied/unsupported states.
- **Seed** — now creates a `researcher` agent + `Alice's laptop` computer + 7 days of run history (tokens/cost) so the Usage dashboard, Activity feed, and Agents page are non-empty in the demo. Idempotent.

### Verified
- `npm test` ✅ **78/78** (shared 24, api 78 incl. **18 new Phase-6 tests**: notifications create/list/markRead + per-user scoping, search FTS + task ILIKE + tenant isolation, usage aggregation + window clamp, agent-team create + handle suffix + unknown-template 400, cron parse/match/due + `fireScheduledTasks` end-to-end, push subscribe/delete round-trip, workspace run feed).
- `npm run lint` ✅ (0 errors, 2 pre-existing warnings) · `npm run format:check` ✅ · web build ✅ · seed ✅ (idempotent re-run ✅).

### Deviations / notes
- ⚠️ **Fixed a real bug in `push.subscribe`**: it used `upsert({ where: { endpoint } })` but `endpoint` has no unique constraint → Prisma rejected it. Switched to findFirst-by-(userId,endpoint) + create/update. Caught by the new push test.
- ⚠️ **`usageQuerySchema` enforces `.max(365)` at the schema** (service clamp is defence-in-depth); the test asserts 365 ok / 99999 → 400.
- Web bundle grew to **1.0 MB / 293 kB gzip** (from 583 kB) — Recharts is now actually rendered. Code-splitting/manualChunks is a Phase 8 task.
- VAPID keys must be set in env for push to deliver; `sendPush` is a silent no-op when unconfigured (the subscribe round-trip still works).
- `GET /workspaces/:id/runs` reuses `listRuns(workspaceId)` (no agent filter) with agent name/handle joined for the Activity feed.
- Google OAuth (§3) is the remaining Phase 6 item not done — it's listed in the plan as Phase 6 but is auth plumbing independent of the observability/notification goal; deferring to Phase 7 alongside billing/landing so Phase 6's "done when" milestone is met.

---

## Phase 5 — Multi-agent collaboration ✅ (2026-07-13)

_Goal: coder-agent writes code → hands to reviewer-agent → reviewer requests your approval before running tests. — **MET (proven end-to-end).**_

### Built
- **Schema** (`add_phase5_loop_safety`): `AgentRun.chainDepth` + `parentRunId` + `trigger` (+ index). Loop-safety caps (`AGENT_LOOP_LIMITS`) already defined in Phase 4 are now enforced. No new tables.
- **Agent→agent handoffs** (`runs`): `postAgentMessage` now calls `triggerForMentions` with `parentRunId`/`excludeActorId` — an agent @mentioning another agent during its run triggers a chained run (chainDepth +1, trigger `handoff`). When the parent run has a task, a **subtask** is created under it and assigned to the recipient (§8.4 subtask magic). Self-trigger guard skips the sending agent; defence-in-depth in `triggerRun`.
- **Loop safety**: `triggerRun` refuses (`RunRefusedError` → 429) when chain depth > `MAX_CHAIN_DEPTH` (5) or the workspace hourly cap (`RUNS_PER_HOUR_PER_WORKSPACE`) is hit, posting an in-thread note on a blocked handoff. **Per-agent one-run-at-a-time**: a second trigger while an agent is active stays `queued` and is drained when the active run finishes (`finishRun`) or the daemon reconnects (`dispatchQueuedForComputer`).
- **Approval gates** (improvement #3): daemon `approval_request` event → `requestApproval` parks the run (`awaiting_approval`) + posts an **ApprovalCard** message (`payload.type: approval`). `POST /approvals/:id/decide` (membership-guarded) flips the card, resumes the run, and relays `approval.decision` to the daemon so the adapter's `requestApproval()` promise resolves. `decideApproval` is **atomic** (conditional `updateMany WHERE decision IS NULL` → no double-decide) and guards on run status; cancel/finish **void** open approvals so a stale card can't resurrect a finished run.
- **Artifact review** (improvement #6): agents post `payload.type: artifact` (`diff|code|markdown|image`); new **ArtifactViewer** renders unified diffs (color-coded), code, markdown, and images in-thread instead of raw dumps.
- **Run cancel/retry**: `POST /runs/:id/retry` re-dispatches a finished run as a fresh attempt (resets chain depth); cancel + queued-run re-dispatch round out the lifecycle.
- **Task claim by agents**: assigning a task to an agent (create/PATCH/handoff) triggers a task-bound run in the task's thread.
- **Hardened memory** (§8.2): daemon `ensureAgentHome` + `loadMemory` feeds `AGENT.md`/`MEMORY.md` into the run context; `appendRunLog` writes a durable run-summary line at finish. Real runtimes (claude-code) can rewrite MEMORY.md via cwd.
- **Daemon contract**: client now owns per-run event seq (adapters + the approval gate share one counter → no `(runId,seq)` collisions); adapters return `{ done: Promise, status(), cancel(), usage() }` and receive `requestApproval`. Mock adapter gained opt-in artifact/handoff/approval paths driven by context markers (default hello-world unchanged). claude-code adapter wires `requestApproval` to gated tool_use (best-effort until the Agent SDK `canUseTool` hook lands).
- **Frontend**: `ApprovalCard` + `ArtifactViewer` render from message payloads; `Agents` page gained per-agent approval-policy toggles + recent-run list with retry; `RealtimeProvider` handles `approval.requested/decided`; Composer now mentions agents by `@handle` (server resolves agents by handle, not name); `toMember`/`listMembers` include agents so they appear in the member list + autocomplete.

### Verified
- `npm test` ✅ **77/77** (shared 17, api 60 incl. **14 Phase-5 tests**: handoff chain + subtask + chainDepth, self-trigger guard, chain-depth cap + blocked note, hourly cap → 429, approval request→decide→resume, retry, task→agent; + 6 hardening regressions).
- `npm run lint` ✅ · `npm run format:check` ✅ · web build ✅.

### Deviations / notes
- ⚠️ **claude-code approval gating is best-effort**: the `-p` headless CLI is non-interactive, so a true block-and-ask gate needs the Claude Agent SDK `canUseTool` hook (follow-up). The card is posted; the SDK hook will make the decision block.
- Approval policy defaults: `requireApprovalOutsideWorkspace: true`, others false (configurable per agent in the UI).
- **Adversarial review**: ran a 5-lens workflow (correctness / authz-tenant-isolation / validation / loop-safety-concurrency / secrets-privacy) — 23 agents, **13 raw findings, all adversarially verified**. **10 distinct confirmed defects fixed** + 6 regression tests: cross-tenant `PATCH/DELETE/test /agents/:id` missing membership guard (→ 403 + computerId-in-workspace check); private-channel content shipped to non-member agents (`resolveMentions` now channel-member-gated for private/DM); claude-code approval `label` leaked tool input (file contents) → minimal safe label + server-side `approvalRequestPayloadSchema`; `ingestEvent` status allowlist (daemon can't forge terminal status); per-agent concurrency cap (was entirely unenforced); `decideApproval` atomic + status guard (no double-decide, no resurrection); queued offline runs re-dispatched on daemon connect; blocked-handoff note authored by the originator; `P2023`→400. Also fixed a real production bug found along the way: daemon socket event handlers were registered **after** async presence work, dropping any event emitted during connection setup.

---

## Phase 4 — Daemon + first agent ✅ (2026-07-13)

_Goal (🎉 the demo): @agent in a channel → agent on your laptop streams a reply. — **MET (proven end-to-end).**_

### Built
- **Prisma** (`add_computers_agents_runs`): `Computer`, `DeviceToken`, `Agent` (+ actor/membership), `AgentRun`, `RunEvent`, `Approval`. New enums: ComputerStatus, AgentStatus, RunStatus, ApprovalDecision. (`Runtime` enum was later dropped — `agents.runtime` is TEXT, single value `claude-code`.)
- **Computers module**: HMAC-signed stateless pairing codes → `POST /daemon/pair` mints a computer + hashed device token (revocable). `resolveDeviceToken` for socket auth.
- **Agents module**: CRUD + agent-as-Actor + `role:agent` membership (so agents are @mentionable & can post). `@handle` mention resolution extended to agents.
- **Runs orchestration**: `triggerRun` (queued → dispatch to the agent's online computer; offline → queued note), event ingestion (deduped on `runId,seq`, status sync), `postAgentMessage` (agent-authored message in the trigger thread, `#general` fallback), `finishRun` (usage + agent idle). @mention of an agent auto-triggers a run.
- **`/daemon` namespace**: device-token auth, heartbeat/presence (online/offline + agent status), `run.dispatch`/`run.cancel`, and `run.event`/`run.message`/`run.finished` ingestion with a per-socket `computerId` ownership guard.
- **Daemon package** (`@flotilla/daemon`): real CLI — `pair <server> <code>` (exchanges code → token, stores `~/.flotilla/config.json`) and `start` (connects `/daemon`, spawns runtime adapters, streams events back). **Mock adapter** (scripted stream + reply, no keys) + **claude-code adapter** (spawns `claude -p --output-format stream-json`; needs the binary). `~/.flotilla/agents/<handle>/` agent home.
- **Frontend**: Agents & Computers page (pairing-code → copyable `npx flotilla-daemon pair …`, computer list + revoke, agent CRUD + **Test** fire-run button); sidebar Agents nav; run-lifecycle socket events wired into the cache.

### Verified
- `npm test` ✅ **57/57** (shared 11, api 46 incl. **agent daemon E2E**: pair → fake daemon connects with device token → `POST /agents/:id/test` dispatches → daemon streams `run.event`+`run.message`+`run.finished` → **agent reply lands in channel** + run `succeeded` with usage; and bad-token socket rejected).
- `npm run lint` ✅ · `npm run format:check` ✅ · web build ✅ · daemon CLI boots.

### Deviations / notes
- ⚠️ **claude-code adapter is the sole runtime** and needs the `claude` CLI + credentials to produce real replies. E2E tests drive runs via scripted daemon sockets (never invoking the adapter), so CI stays key-free. The `mock` + `codex` adapters were removed; `claude-code` is the default runtime.
- Pairing codes are stateless HMAC tokens (no pairing table); acceptable for beta, one-time-ish (valid 10 min).
- RunActivity live strip + onboarding funnel (improvement #9) are scaffolded (run events query + lifecycle broadcasts); a full streaming "thinking" accordion + guided onboarding polish are Phase 5/6 follow-ups.
- `/daemon/pair` migration needed the non-interactive `migrate diff` → `migrate deploy` path (unique-constraint warning); CI uses `migrate deploy` too.

---


_Goal: create task in chat → drag it on the board → thread reflects every change. — **MET.**_

### Built
- **Prisma**: `add_tasks` migration — `Task` + `TaskEvent` (audit trail) models, back-relations on Workspace/Channel/Actor.
- **Tasks module**: CRUD + status lifecycle (backlog→claimed→running→needs_review→done/cancelled), priority, assignee, due, **claim / handoff / complete**, `canMutateTask` permission guard (creator/assignee/admin/owner). Creating a task in a channel posts a **task-card payload message** that doubles as the task's discussion-thread root; status changes sync back to the card. Every mutation appends a `task_event`.
- **Realtime**: `broadcastTask` (created/updated) — board updates live across browsers.
- **Frontend**: Kanban **board** (native HTML5 drag-and-drop between columns) + **list** view toggle, `TaskCard` (priority badge, assignee avatar, due), create-task dialog, task **detail modal with audit trail**, inline task-card rendering in chat, Tasks nav in sidebar.

### Verified
- `npm test` ✅ **55/55** (shared 11, api 44 incl. 8 task tests: create-with-card, list/filter, claim, lifecycle running→needs_review→done, audit trail, handoff, non-member 403, finished-task 409).
- `npm run lint` ✅ · `npm run format:check` ✅ · web build ✅.

### Deviations / notes
- Drag-and-drop uses the native HTML5 DnD API (no extra dep); a polished lib (dnd-kit) is optional for Phase 8.
- Agent→agent handoff with subtask creation is Phase 5; Phase 3 handoff = reassign + claim.
- Task detail is a modal (the `/:ws/tasks/:id` route is deferred — modal covers the UX).

---


Ran an adversarial 4-lens workflow (authz / authn / validation / secrets) — **20 agents, 16 raw findings, 15 adversarially confirmed**. All 15 fixed + 5 regression tests pinning the worst ones.

**Fixes applied:**
- 🔴 **CRITICAL — pre-auth account takeover via invite**: anonymous `acceptInvite` resolved to an existing user's account (inverted guard). Split into `signUpViaInvite` (refuses existing emails → forces login path) + `acceptInviteAuthenticated` (recipient email-bound). Regression test asserts takeover → 409, victim unchanged.
- 🟠 **HIGH — session fixation**: added `loginUserSession()` (regenerate sid) on login/signup/invite-accept.
- 🟡 reset-password token TOCTOU → atomic `updateMany WHERE used_at IS NULL`.
- 🟡 reset no longer leaves old sessions alive → `DELETE FROM session WHERE sess->>'userId'`.
- 🟡 forgot-password timing oracle → mail fire-and-forget + dummy argon2 on the no-account branch.
- 🟡 invite recipient binding + atomic single-use + never re-role existing members.
- 🟡 invite tokens scrubbed from pino access logs (custom req serializer).
- 🟡 5xx internal messages masked in prod ("Internal Server Error").
- 🟢 invite-preview drops invited email (PII); invite-accept Zod-validated (12-char policy); HTML-escape workspace name + user name in emails.
- ➕ rate limiting (express-rate-limit) on auth + password-reset + message-send (skipped in test).

---

## Phase 2 — Chat core ✅ (2026-07-12)

_Goal: two browsers chat in real time with threads and files; refresh loses nothing. — **MET (realtime proven live).**_

### Built
- **Channels module**: public/private/DM, find-or-create DM by member set, per-actor listing with unread counts, read cursors (`markRead`).
- **Messages module**: cursor pagination by `(createdAt,id)` newest-first, threads (oldest-first), reactions (aggregated), server-side **@mention** resolution (`@token` → workspace member actor), optimistic-send dedupe by `clientNonce`, edit/delete (owner-only, soft-delete). Sender/reaction enrichment on every read.
- **Uploads module**: presigned PUT → MinIO/S3, attachment row created up-front and connected on send, per-file size (50 MB) + mime allowlist.
- **Realtime** (`realtime/index.js`): Socket.IO `/client` namespace, **session-cookie authenticated**, actors join a room per workspace (`ws:<id>`) — broadcasting to a room is tenant-isolated by construction. Broadcast helpers: `message.created/updated/deleted`, `reaction.added`, `typing`. Persist-first rule enforced (routers write then broadcast).
- **Frontend chat UI**: Tailwind-v4 design system extended; channel sidebar (grouped Channels/Private/DMs + unread badges); MessageList (auto-scroll, load-older-on-top, day dividers, message grouping); Composer (@mention autocomplete, drag-drop file → presign upload, typing indicator, Enter-to-send); MessageItem (markdown via react-markdown+remark-gfm, reactions, thread reply); ThreadPanel; RealtimeProvider patches TanStack Query cache from socket events.

### Verified
- `npm test` ✅ **47/47**: shared 11, api 36 (incl. chat REST suite 10 + **2 socket E2E**: live `message.created` delivery to a peer socket in the same workspace, and **no leak** to a socket in a different workspace).
- `npm run lint` ✅ · `npm run format:check` ✅ · web build ✅ (542 kB / 163 kB gzip).

### Deviations / notes
- ⚠️ Message list is **non-virtualized** for demo correctness; `@tanstack/react-virtual` is a dep and virtualization is a Phase 8 hardening task (matters at the ~50-user load test). The Phase-2 "done when" milestone does not require it.
- @mention resolution is name-token based (no agent handles yet — agents land in Phase 4 with explicit `@handle`).
- Search endpoint reserved (returns `[]`, ships in Phase 6 with Postgres FTS).
- Socket E2E test uses polling transport for reliable cookie auth; production clients use websocket+upgrade.
- Web bundle > 500 kB — code-splitting/manualChunks is a Phase 8 optimization.

---


_Goal: two real users share a workspace via invite link. — **MET (verified live).**_

### Built
- **Auth module** (`modules/auth`): argon2id passwords (timing-safe login), Postgres sessions via existing connect-pg-simple store, email verification + password reset (sha256-hashed tokens, expiry, single-use), `PATCH /auth/me` profile update. Mail is best-effort (a flaky mailer never blocks signup).
- **Workspaces module** (`modules/workspaces`): create (owner actor + default `#general` + membership in one tx), list/get/update, members list, invite create/preview/accept. Invites: 7-day TTL, hashed token shown once, inline-signup or existing-user accept, auto-join `#general`.
- **Middleware**: `requireAuth`/`optionalAuth` (session → user+actor), `requireWorkspaceMember` (resolves slug|uuid, verifies membership → tenant isolation), `requireRole` (role-rank gating). Wired into all routes.
- **Web app shell** (real, replaces Phase 0 placeholder): Tailwind v4 design system (class dark-mode, brutalist tokens), React Router v7, TanStack Query, Zustand (theme + drafts), Lucide. Pages: Login, Signup, Forgot/Reset password, Verify email, Accept invite, Workspace picker, Home, Members (invite form w/ copyable link), Settings (profile + workspace + appearance). Vite proxies `/api` + `/socket.io` to the API.
- **Auth context** (`useAuth`): me/login/signup/logout mutations; queries auto-retry-except 401/403.

### Verified
- `npm test` ✅ 28/28 (shared 11, api 17 incl. full **tenant-isolation suite**: non-member → 403 on workspace read + members list; unauthenticated → 401; dup signup → 409; bad creds → 401).
- `npm run lint` ✅ clean · `npm run format:check` ✅ · `npm run build` (web 262kB/82kB gzip, landing) ✅.
- **Live HTTP smoke** (two real cookie jars): A signs up+creates ws → A invites B → B previews "Live Co" + accepts → members = `Live A(owner), Live B(member)` → unrelated user C → **403**. End-to-end through the real `server.js` boot path + Postgres session store.

### Deviations / notes
- `citext` still deferred (emails pre-lowercased); UUID-or-slug resolution in workspace middleware accepts both `:id` forms.
- Rate limiting (§11) and Google OAuth (§3) deferred — rate-limit middleware lands with Phase 2 message-send throttling; OAuth is Phase 6.
- Frontend uses explicit `var(--color-*)` classes (IDE suggests canonical forms; both valid — kept explicit for design-token clarity).
- TODO (Phase 2): per-IP auth rate limiting; CSRF double-check on mutations beyond SameSite (currently SameSite=Lax + JSON content-type).

---


_Goal: `npm run dev` boots everything; CI green. — **MET.**_

### Built
- **Monorepo** (npm workspaces): `apps/{api,web,landing}` + `packages/{shared,daemon}`, root `dev` runs all three via `concurrently`.
- **Tooling**: ESLint flat config (v9) + `eslint-plugin-react` + Prettier; `engines.node >=20`. ESLint is the static gate (no `tsc` — plain JS per §3).
- **`packages/shared`** (contract layer): Zod schemas (auth, workspace, channel/message, common primitives), constants (PLAN_LIMITS, roles/statuses, **socket event names** for `/client` + `/daemon`), AppError hierarchy. 11 unit tests.
- **Docker Compose**: Postgres 17, MinIO (+ auto bucket creator), Mailpit.
- **Prisma**: baseline migration `20260712171630_baseline` covering identity→messages (users, actors, workspaces, members, invites, channels, channel_members, messages, attachments, reactions, mentions, session). Later phases extend the schema additively.
- **Express 5 skeleton**: helmet, CORS (credentials), compression, pino-http logging, Postgres sessions (connect-pg-simple, 30-day rolling httpOnly cookies), Zod validate middleware, centralized error handler (maps AppError + Prisma codes), graceful shutdown. `GET /health` (DB probe). Config via Zod-validated env.
- **CI**: GitHub Actions — lint → format → migrate → test, on Postgres 17 service container.
- **Seed**: demo workspace (`demo`) + 2 users (alice/bob, `demo-password-123`) + `#general` + welcome messages.
- **`web`/`landing`**: placeholder Vite+React stubs (build clean; real shells in Phase 1 / Phase 7). **`daemon`**: version-aware CLI stub (Phase 4).

### Verified
- `npm install` ✅ (389 pkgs) · `npm run lint` ✅ clean · `npm run format:check` ✅
- `npm run db:migrate` ✅ baseline applied · `npm run db:seed` ✅
- `npm test` ✅ 14/14 (shared 11, api 3)
- `npm run build` (web + landing) ✅
- API live: `GET /health` → `{"status":"ok","db":"ok","latency_ms":28}`; unknown routes → `404 NOT_FOUND`; pino structured logs; DB connected; mailer reachable.

### Deviations / notes
- ⚠️ **Postgres host port remapped 5432 → 5433**: a native Homebrew `postgresql@14` was holding `127.0.0.1:5432`/`::1:5432` and shadowing the container. Compose + `apps/api/.env` + `.env.example` use `5433`; CI's service container keeps `5432` (no native PG in runners).
- ⚠️ **`citext` deferred**: email/slug stored pre-lowercased at the app layer (Zod lowercases); plain `String` unique indexes. Revisit if case-insensitive collation edge cases appear.
- ⚠️ **Schema front-loading decision**: Phase 0 baseline intentionally covers the full "users → messages" core in one migration (rather than per-table dribbles); tasks/agents/runs/etc. are added as named migrations in their phases.
- Node 20 locally (plan wants 22 LTS) — works; `engines >=20`. Bump on build host before beta (Phase 8).

---

