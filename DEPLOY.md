# DEPLOY.md — Production Deployment

How to run Flotilla in production. This reflects the **built** app and the
**Option A** deployment shape chosen for the beta: **the API serves the built web
SPA as a single origin** (PLAN §14), so there's no CORS/cookie/SameSite complexity.

> Stack: **Railway** (API + SPA) · **Neon** (Postgres) · **Cloudflare R2** (uploads) ·
> **Resend** (email) · **npm** (daemon). Netlify only for the marketing landing site.
> See [`APPFLOW.md`](./APPFLOW.md) for how the app works.

---

## 1. Architecture (Option A — single origin)

```
                 ┌─────────────────────────────────────────┐
  Browser ──────▶│  Railway — one service                   │
  (app + /api)   │  Express (REST + Socket.IO /client)      │
  WSS /daemon ◀──│  serves apps/web/dist (built SPA)        │
                 │  pg-boss (cron jobs, same DB)            │
                 └───────┬──────────────┬─────────────┬─────┘
                         │              │             │
                  Postgres│           S3│           SMTP│
                     ▼ Neon            ▼ R2         ▼ Resend

  User laptops ──WSS──▶ same Railway URL  (npx flotilla-daemon)
```

Single instance is fine for the beta — Socket.IO only needs sticky sessions when
scaling past one instance. One origin = no cross-origin cookie/CORS work.

---

## 2. Services & cost

| Need | Service | Cost | Notes |
|---|---|---|---|
| App (API + SPA) | Railway Hobby | ~$5/mo | Single service; one instance. |
| Postgres | Neon free | $0 | Use the **pooled** (`-pooler`) URL. Autosuspends when idle (cold start on first query). |
| File storage | Cloudflare R2 free | $0 | 10 GB + free egress. |
| Email | Resend free | $0 | 3,000/mo, 100/day. SMTP interface. |
| Landing site | Netlify free | $0 | `apps/landing` only (optional, separate origin). |
| Daemon | npm | $0 | `npm publish @atul1104/daemon` so `npx` works. |
| Custom domain | any registrar | ~$10–15/yr | Optional but recommended for a clean URL. |

---

## 3. Prerequisites (do these first)

1. **Neon** — create a project. Copy the **pooled** connection string (`…-pooler.neon.tech…?sslmode=require`). Run migrations once:
   ```bash
   DATABASE_URL='postgresql://…?sslmode=require' npm run db:migrate:deploy
   ```
2. **Cloudflare R2** — create a bucket + an API token (Object Read & Write). Grab the
   account-level S3 endpoint (`https://<accountid>.r2.cloudflarestorage.com`), the
   bucket name, and the Access Key ID / Secret. Add a **bucket CORS rule**:
   ```json
   [{
     "AllowedOrigins": ["https://<your-app-origin>", "http://localhost:5173"],
     "AllowedMethods": ["GET", "PUT", "HEAD"],
     "AllowedHeaders": ["content-type", "content-length"],
     "ExposeHeaders": ["ETag", "Content-Length"],
     "MaxAgeSeconds": 3600
   }]
   ```
   (Browsers upload directly to R2 via presigned PUT, so this is required.)
3. **Resend** — verify a sending domain (or use `onboarding@resend.dev` to test).
   Copy the API key (`re_…`).
4. **(Optional) Custom domain** pointed at Railway once the service is up.

---

## 4. Environment variables (set in the Railway dashboard)

**Required (API won't boot without these):**

| Var | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon pooled URL (`…?sslmode=require`) |
| `SESSION_SECRET` | `openssl rand -hex 32` (≥32 chars) |
| `APP_ORIGIN` | your deployed URL, e.g. `https://flotilla.up.railway.app` |
| `API_ORIGIN` | same as `APP_ORIGIN` (Option A = single origin) |
| `S3_ENDPOINT` | `https://<accountid>.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` |
| `S3_BUCKET` | your R2 bucket name |
| `S3_ACCESS_KEY_ID` | R2 access key ID |
| `S3_SECRET_ACCESS_KEY` | R2 secret |
| `S3_FORCE_PATH_STYLE` | `true` |

**Email (set these — `RESEND_API_KEY` alone is NOT read by the app):**

| Var | Value |
|---|---|
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `587` (STARTTLS — the mailer hardcodes `secure:false`; **465 won't work**) |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | your Resend API key (`re_…`) |
| `MAIL_FROM` | `Flotilla <noreply@your-verified-domain.com>` |

**Optional:**

| Var | Value |
|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | generate: `npx web-push generate-vapid-keys`; leave unset to disable push |
| `VAPID_SUBJECT` | `mailto:you@yourdomain.com` |
| `SENTRY_DSN` | leave unset to disable error capture |

---

## 5. Railway service configuration

These commands are version-controlled in [`railway.toml`](./railway.toml) at the
repo root, so they track the repo (e.g. a package-scope rename updates them via git
instead of silently breaking deploys). Railway v2 reads that file on deploy. If you
previously set Build/Start/Release commands in the dashboard, **clear those fields**
so the dashboard doesn't override the toml.

| Setting | Value |
|---|---|
| **Root directory** | repo root |
| **Node version** | 22 (`.nvmrc` exists; the plan targets 22 LTS) |
| **Install** | `npm install` |
| **Build** | `npm run build` |
| **Start** | `npm start` |
| **Release command** | `npm run db:migrate:deploy` |
| **Healthcheck** | path `/health` (returns `status: ok`; only a DB failure flips it to 503) |

- `prisma generate` runs automatically via the `postinstall` hook (and `prisma` is in
  `dependencies`, not devDependencies, so it's present even under `NODE_ENV=production`).
  That's what produces `@prisma/client` — no manual generate step needed.
- `npm run build` produces `apps/web/dist`, which `apps/api/src/app.js` serves (with
  an SPA fallback for client-side routes). That's the whole of "Option A."
- The **release command** applies pending Prisma migrations to Neon on every deploy.
- Railway injects env vars into `process.env`, so the local `dotenv`/cwd nuance does
  not apply here.

---

## 6. After first deploy

1. **Point a custom domain** at the Railway service (optional) and update
   `APP_ORIGIN` / `API_ORIGIN` to match.
2. **Publish the daemon** so beta users can pair their computers:
   ```bash
   npm version patch && npm publish --workspace @atul1104/daemon
   ```
   Then a user runs:
   ```bash
   npx flotilla-daemon pair https://<your-app-origin> <pairing-code>
   npx flotilla-daemon start
   ```
   (Pairing codes are minted in the web app: **Agents & Computers → Generate pairing code**.)
3. **(Optional) Seed demo data** so you can log in immediately:
   ```bash
   DATABASE_URL='…' npm run db:seed        # demo workspace (alice/bob)
   DATABASE_URL='…' node apps/api/prisma/seed-beta.js 5   # 5 beta teams
   ```
   Skip this for a clean prod DB and create workspaces via the app instead.
4. **Landing site** (optional): deploy `apps/landing` to Netlify as a static site
   (build `npm run build --workspace @atul1104/landing`, publish `apps/landing/dist`).

---

## 7. Verify it's live

```bash
# Health — expect status:ok, db:ok, jobs:ok
curl https://<your-app-origin>/health

# SPA served — expect 200 text/html
curl -I https://<your-app-origin>/

# API reachable — expect JSON 404 (not shadowed by the SPA)
curl https://<your-app-origin>/api/v1/nope
```

Then in the browser: sign up → create a workspace → you should land in `#general`.
Generate a pairing code and run the daemon on your laptop to confirm the agent loop
end to end.

---

## 8. Gotchas

- **Don't run the test suite against the prod DB.** `npm test` loads `apps/api/.env`,
  so if `DATABASE_URL` points at Neon it will run — and pollute Neon with test
  workspaces. Keep a local Postgres for dev/test; put the Neon URL only in Railway.
- **Locally, boot via the workspace script** (`npm start --workspace @atul1104/api` or
  `npm run dev`), not `node apps/api/src/server.js` from the repo root — `dotenv`
  loads `.env` from the current directory, and `.env` lives in `apps/api/`.
- **Neon cold starts:** the free tier autosuspends after idle; the first request after
  sleep takes a second or two. The per-minute pg-boss tick keeps it warm.
- **Email is best-effort:** without SMTP set, signup works but verify/reset/invite
  emails silently don't deliver.
- **Single instance only (for now):** past one Railway instance, Socket.IO needs sticky
  sessions + the Redis adapter. Not a beta concern.
- **`/health` `jobs` field:** reports pg-boss state (`countStates`). If it shows
  `error`, scheduled tasks/digests won't fire — check the Railway logs for pg-boss.

---

## 9. Quick cost recap

Everything runs on free tiers **except** Railway Hobby (~$5/mo), which you already
have. R2 + Resend + Neon + Netlify cover a hand-picked beta comfortably within their
free limits.
