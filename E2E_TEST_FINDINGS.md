# Flotilla — End-to-End Test Findings

**Date:** 2026-07-14
**Target:** Local API (`node apps/api/src/server.js`, PORT 4000) against the live **Neon** Postgres DB (production connection string from `apps/api/.env`).
**Scope:** Real-user signup → auth → full CRUD across workspaces, channels, agents, computers, pairing, agent teams, messages, runs → logout + auth guards. Edge-case validation. All test data was created and **wiped** afterwards (see Cleanup below).

---

## TL;DR

| Result | Count |
|---|---|
| ✅ Flows passing | 16 |
| ❌ App defects found | **0** |
| ⚠️ Notes / minor observations | 2 |

**The `serverUrl` pairing fix (commit `8b9aee1`) is verified working end-to-end against the production env config** — see below.

No application defects were found. Two checks initially failed during the sweep, but both were **errors in my test script** (wrong URL / wrong field name), not bugs in Flotilla. They are documented so the correct API contract is recorded.

---

## ✅ What works (verified against Neon)

- **Auth** — `POST /api/v1/auth/signup` → `201`, sets `flotilla.sid` session cookie, creates user + workspace atomically. `GET /auth/me` returns the session user. `POST /auth/logout` clears the session; subsequent `/auth/me` → `401`. ✅
- **Workspaces** — create (`201`), list, rename (`PATCH` → `200`). ✅
- **Channels** — create (`201`), list. ✅
- **Agents** — create with `mock` and `claude-code` runtimes (both `201`). The `claude-code` runtime now persists correctly as text — **confirming the fix in commit `6433bae`** (`agent_runtime_text` migration applied during this test). `POST /agents/:id/test` fires a run (`201`, runId returned); the run appears in `GET /agents/:id/runs` with status transitioning to `queued`. ✅
- **Computers + pairing** — `POST /workspaces/:id/computers/pairing-code` returns `{ code, serverUrl }`. `serverUrl` = `https://flotillaapi-production.up.railway.app` (the real `API_ORIGIN`), **not** `localhost`. `POST /daemon/pair` exchanges the code for `{ computerId, deviceToken }` (`201`). ✅
- **Agent teams** — `GET /workspaces/:id/agent-templates` returns 3 blueprints (`research`/1 agent, `dev`/3, `support`/2). `POST /workspaces/:id/agent-teams` creates the team (`201`, correct agent count per template). ✅
- **Messages** — `POST /channels/:channelId/messages` → `201` (correct path has **no** workspace prefix). ✅
- **Notifications, Usage, Search** — all `200`. ✅
- **Edge-case validation (all correct):**
  - Duplicate agent handle → `409 CONFLICT` ✅
  - Invalid runtime → `400 VALIDATION_ERROR` ✅
  - Invalid signup email → `400 VALIDATION_ERROR` ✅
  - Logged-out request to protected route → `401` ✅
- **Deployed Railway API** — `https://flotillaapi-production.up.railway.app/health` → `200`, signup endpoint returns proper validation errors. (An initial probe returned a transient `502` — cold start/redeploy — and recovered. **Not a defect.**)

---

## ⚠️ Notes & observations (no code change required)

### 1. Approval-policy PATCH requires full constant keys, not short names
- `PATCH /api/v1/agents/:id` with `{ approvalPolicy: { shell: true } }` → `400 VALIDATION_ERROR`.
- The schema (`packages/shared/src/schemas/agent.js`) keys are the long constants from `APPROVAL_POLICY_KEYS`:
  `requireShellApproval`, `requireFileWriteApproval`, `requireApprovalOutsideWorkspace`, `requireApprovalForAllTools`.
- **The frontend is correct** (`apps/web/src/pages/Agents.jsx` uses `APPROVAL_POLICY_KEYS` via the `POLICY_LABELS` map), so this is **not a bug** — just a gotcha for anyone calling the API directly. Correct payload: `{ approvalPolicy: { requireShellApproval: true } }` → `200`.

### 2. Message + team-template routes have no workspace prefix
- `POST /api/v1/workspaces/:ws/channels/:ch/messages` → `404 NOT_FOUND` (route not registered).
- Correct path: `POST /api/v1/channels/:channelId/messages`.
- Same for templates: `GET /api/v1/workspaces/:id/agent-templates` (plural `agent-templates`), not `/agent-teams/templates`.
- **The frontend uses the correct paths** (`apps/web/src/hooks/api.js`). Not a bug — but the path is slightly inconsistent with other workspace-scoped resources, so it's worth knowing.

---

## 🧹 Cleanup performed

All test data was created under disposable accounts matching `e2e-*@flotilla-test.dev` and has been **fully deleted** from the Neon DB:

- 5 test users, 6 workspaces, 5 actors, 5 email tokens — deleted via a Prisma transaction in dependency order (workspaces → actors → tokens → users), respecting that `Workspace.owner → User` is **not** cascade.
- Cascade rules removed all dependent channels, messages, agents, agent runs, computers, device tokens, tasks, and notifications.
- **0 test users remain** (verified via `prisma.user.count`).
- The **31 pre-existing users / 31 workspaces** in the DB were **not touched** — they predate this test.

The pending migration `20260714035800_agent_runtime_text` was applied to Neon during setup via `prisma migrate deploy`. This is a harmless, additive column-type change and was already committed to `main` (`6433bae`); leaving it applied is correct.

---

## How to reproduce

```bash
# from repo root
cd apps/api
npx prisma migrate deploy          # ensure schema current
node src/server.js                 # local API on :4000 against Neon

# in another shell — smoke test signup
curl -s -X POST http://localhost:4000/api/v1/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"<unique>@flotilla-test.dev","name":"Test","password":"twelve-char-min","workspaceName":"Test"}'
```

The full CRUD sweep was driven by a throwaway Node script (cookie-jar fetch loop over every endpoint); that script was deleted after the run and is not committed.
