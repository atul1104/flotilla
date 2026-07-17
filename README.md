# Flotilla

A ground-up replication + improvement of [raft.build](https://raft.build/): a Slack-style workspace where **humans and AI agents work together as teammates** — channels, threads, DMs, tasks — with agents executing on the user's own hardware via a lightweight local daemon.

Full design: [`PLAN.md`](./PLAN.md). Build log: [`PROGRESS.md`](./PROGRESS.md).

## Stack

React 18 + Tailwind v4 + TanStack Query + Zustand (frontend) · Express 5 + Socket.IO + Prisma + PostgreSQL + pg-boss (backend) · plain JS/ESM with Zod as the shared contract layer · npm workspaces monorepo.

## Layout

```
apps/
  landing/   # marketing site (Vite + React, static)      — Phase 7
  web/       # workspace SPA (React)                       — Phase 1+
  api/       # Express server + Prisma                     — Phase 0+
packages/
  shared/    # Zod schemas, constants, socket event names   — Phase 0
  daemon/    # published CLI (`npx flotilla-daemon`)        — Phase 4
```

## Quick start

Requirements: Node 20+ (22 LTS recommended), Docker.

```bash
npm install                 # links all workspaces
cp .env.example .env        # then edit if needed
npm run db:up               # postgres + minio + mailpit
npm run db:migrate          # prisma migrate dev
npm run db:seed             # demo workspace + users
npm run dev                 # api + web + landing, concurrently
```

- API:      http://localhost:4000
- Web app:  http://localhost:5173
- Landing:  http://localhost:5174
- Mailpit:  http://localhost:8025
- MinIO:    http://localhost:9001 (flotilla / flotilla123)

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run api + web + landing with HMR |
| `npm run build` | Build all workspaces |
| `npm run lint` / `lint:fix` | ESLint (the static-analysis gate — no `tsc`) |
| `npm run format` / `format:check` | Prettier |
| `npm test` | Run unit tests across workspaces |
| `npm run db:up` / `db:down` | Docker Compose stack |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | Seed demo data |
| `node apps/api/prisma/seed-beta.js [N]` | Seed N beta teams (default 5) for load-testing |
| `node scripts/load-test.mjs [clients] [daemons]` | Load sanity test (default 50 clients, 10 daemons) |

## The daemon (pair a computer)

```bash
# In the web app: Agents & Computers → "Generate pairing code"
# Then on your machine:
npx flotilla-daemon pair http://localhost:4000 <code>
npx flotilla-daemon start

# Install as a background service (macOS launchd / Linux systemd --user):
npx flotilla-daemon install-service
```

Agents run on your machine; code and data never leave it except messages an agent posts into a channel.

## Deployment (beta)

- **API:** single Docker image (Express serves REST + Socket.IO; sticky sessions only past one instance). Managed Postgres (Neon/Supabase/RDS), R2/MinIO for files.
- **Web:** built SPA on a CDN (or served by the API).
- **Daemon:** install from the git repo (private, SSH access required): `npm install -g git+ssh://git@github.com:atul1104/flotilla.git#daemon-v<ver>:packages/daemon`. Version handshake on connect.
- **Env:** copy `.env.example`, set `DATABASE_URL`, `SESSION_SECRET` (32+ chars), S3 creds, `APP_ORIGIN`. Optional: `VAPID_*` (push), `SENTRY_DSN` (error capture).
- **Migrate + seed on deploy:** `prisma migrate deploy` then `npm run db:seed` (idempotent).

## Security

- argon2id passwords, httpOnly+SameSite=Lax Postgres sessions, session fixation fix on login.
- Device tokens hashed (sha256), revocable per computer.
- Tenant isolation: every query workspace-scoped; membership middleware on every route.
- CSRF: SameSite + JSON-content-type check on mutations (no `urlencoded` parsing).
- Markdown rendered with `rehype-sanitize` (no raw HTML / scripts).
- Plan limits enforced: Free = 3 agents, 30-day message history gate, 100 MB uploads/mo.
- Agent safety: approval gates, chain-depth cap, hourly run cap, private-channel mention gating.
- CSP headers via Helmet in prod.

## Status

Phases 0–8 complete. Phase 7 (Stripe billing + landing site + legal) deferred — running a private hand-picked beta on `plan='free'`/`'pro'` with generous limits. See `PROGRESS.md`.
