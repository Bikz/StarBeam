# Starbeam

Starbeam is a macOS menu bar app + web dashboard that delivers a daily “pulse” for organizations and individuals: focused updates and suggested actions derived from company goals, announcements, connected tools (Google for v0), and nightly web research.

## Repo Status

This repository is being built from scratch. The internal planning docs live under `docs/`, which is intentionally gitignored and not published.

## Product Surfaces (v0)

- **macOS menu bar app (SwiftUI)**: daily pulse bump, Today’s Focus, Today’s Calendar, notifications, and quick actions.
- **Web dashboard (Next.js)**: auth, onboarding, workspace/org settings, goals/announcements, Google connections, pulse history/search, job status and “Run now”.
- **Marketing site (Next.js)**: landing pages + waitlist + legal pages (separately deployed from the dashboard).
- **Worker (Node + Postgres queue)**: hourly sync + nightly ingestion + pulse generation jobs.

## Repo Structure

- `apps/web`: authenticated dashboard + API (Render)
- `apps/site`: marketing site + waitlist + legal pages (Vercel)
- `apps/worker`: background jobs
- `packages/db`: Prisma schema + client
- `packages/shared`: shared schemas/utilities

## Docs

Committed docs:

- `CONTRIBUTING.md` (dev workflow + commands)
- `REPO_SETTINGS.md` (branch protection / CODEOWNERS / dependency automation)
- `SECURITY.md` (reporting + automated scanning)
- `runbooks/` (deployment, rollback, observability)

## Local Development

### Requirements

- Node.js >= 20
- pnpm (see `package.json#packageManager`)
- Docker (for Postgres + MinIO)

### Ports + Hosts

Default local ports:

- Web dashboard (`apps/web`): `http://localhost:3000`
- Marketing site (`apps/site`): `http://localhost:3001`

By default we treat the dashboard as an app-subdomain (`app.localhost`) to match production routing:

- `NEXT_PUBLIC_WEB_ORIGIN=http://app.localhost:3000`
- `AUTH_URL=http://app.localhost:3000`
- `STARB_APP_HOST=app.localhost`

Most systems resolve `*.localhost` to `127.0.0.1`. If `app.localhost` doesn’t resolve on your machine, you can
switch to plain `localhost` for all three values above.

### Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm --filter @starbeam/db prisma:migrate
```

Notes:

- `prisma:migrate` runs `prisma migrate deploy` (safe for applying existing migrations).
- When authoring new schema changes locally, use `pnpm --filter @starbeam/db prisma:migrate:dev` to create a new migration.

### Run

```bash
# Web dashboard (http://localhost:3000)
pnpm --filter @starbeam/web dev

# Marketing site (http://localhost:3001)
pnpm --filter @starbeam/site dev -- -p 3001

# Worker (validates env and boots)
pnpm --filter @starbeam/worker dev
```

### Validate

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Production Deploy

Recommended split:

- Dashboard/API (`apps/web`) on Render
- Marketing site (`apps/site`) on Vercel
- Postgres on Neon

## Private Beta Admin (Invite Keys)

Starbeam ships with a private beta gate (invite keys + referrals).

To administer invite keys:

- Set `STARB_ADMIN_EMAILS` (comma-separated) to your admin emails (example: `you@company.com`).
- Sign in with an allowed email.
- Open `/admin/beta-keys` to create/disable keys and view redemptions.

Notes:

- Admin allowlisted emails bypass the beta gate (useful for internal testing / ops).
- Plaintext invite codes are only shown at creation time and are not stored in the DB.

### Dashboard + Worker (Render + Neon)

This repo includes a Render Blueprint at `render.yaml` for deploying:

- `starbeam-web` (Next.js)
- `starbeam-worker` (Graphile Worker runner)

Assumptions:

- Postgres is hosted on Neon (bring-your-own DB).
- HTTPS hosted web origin (required for Google OAuth).

### 1) Create a Neon Postgres Database

- Create a Neon project/database and copy the `DATABASE_URL`.
- Apply migrations once (recommended from your local machine):

```bash
export DATABASE_URL="postgresql://..."
pnpm install
pnpm --filter @starbeam/db exec prisma migrate deploy
```

### 2) Create Google OAuth Credentials

Create a Google OAuth client for the hosted domain and set:

- Authorized redirect URI: `https://YOUR_DOMAIN/api/auth/callback/google`
- Authorized redirect URI (Google integration): `https://YOUR_DOMAIN/api/google/callback`
- Authorized JavaScript origin: `https://YOUR_DOMAIN`

### 3) Create Render Services From Blueprint

In the Render Dashboard:

- New -> Blueprint -> select this repo (must contain `render.yaml`)
- Set required env vars for both services (see `.env.example`)

Minimum required env vars:

- `DATABASE_URL`
- `AUTH_SECRET` (generate a strong random value)
- `AUTH_URL` (web URL, e.g. `https://starbeam-web.onrender.com`)
- `NEXT_PUBLIC_WEB_ORIGIN` (same as `AUTH_URL`)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `STARB_TOKEN_ENC_KEY_B64` (32-byte base64 AES key)
- `OPENAI_API_KEY` (used by the worker for web research)
- `SENTRY_DSN` (optional; enables error reporting for web + worker)
- `STARB_CODEX_EXEC_ENABLED` (optional: set `1` to run `codex exec` for INTERNAL pulse synthesis)
- `STARB_CODEX_MODEL_DEFAULT` (optional: defaults to `gpt-5.2-codex`)
- `STARB_CODEX_REASONING_EFFORT` (optional: defaults to `medium`; set `low` to reduce cost/latency)
- `STARB_CODEX_WEB_SEARCH_ENABLED` (optional: defaults to enabled; set `0` to disable Codex web search)
- `STARB_LEGACY_DEPT_WEB_RESEARCH_ENABLED` (optional: force-enable/disable the legacy dept web research pipeline)
- `S3_ENDPOINT` (S3-compatible endpoint; MinIO locally, R2 in hosted)
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET` (used for encrypted Drive snapshots and attachments; prod bucket name convention: `starbeam-prod-worker-r2`)

### R2 Blob Store Runbook (Worker)

Starbeam stores encrypted connector snapshots/attachments in an S3-compatible blob store. In hosted environments,
use Cloudflare R2 and configure the **worker** with R/W/D permissions.

Recommended: **separate buckets** per environment (simpler + safer than prefixes).

- Prod bucket: `starbeam-prod-worker-r2`
- Staging bucket: `starbeam-staging` (or `starbeam-staging-worker-r2`)

Worker env vars:

- `S3_ENDPOINT`: R2 S3 endpoint, e.g. `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
- `S3_REGION`: can be `auto` or `us-east-1`
- `S3_ACCESS_KEY_ID`: R2 access key id
- `S3_SECRET_ACCESS_KEY`: R2 secret
- `S3_BUCKET`: `starbeam-prod-worker-r2` or `starbeam-staging` (or `starbeam-staging-worker-r2`)

Verification:

- By default, the worker runs a boot-time check (in production) that attempts a small **put/get/delete** round-trip.
  You can override with `STARB_BLOB_STORE_VERIFY_ON_BOOT=0`.

Additional recommended prod env vars:

- `STARB_DAILY_PULSE_ENABLED` (default: `1`)
- `STARB_DAILY_PULSE_WINDOW_START_HOUR` (default: `2`)
- `STARB_DAILY_PULSE_WINDOW_END_HOUR` (default: `5`)
- `STARB_BLOB_GC_ENABLED` (default: `1`)
- `STARB_BLOB_GC_GRACE_DAYS` (default: `14`)
- `STARB_DEVICE_START_LIMIT_5M` (default: `20`)
- `STARB_DEVICE_EXCHANGE_LIMIT_5M` (default: `120`)
- `STARB_RUN_NOW_USER_LIMIT_1M` (default: `3`)
- `STARB_RUN_NOW_WORKSPACE_LIMIT_1M` (default: `5`)
- `STARB_RUN_WORKSPACE_LIMIT_1D` (default: `20`)

### 4) Verify

- Open the deployed web URL, sign in, create an org workspace, and trigger “Run now”.
- Confirm `starbeam-worker` is running and connected to the same `DATABASE_URL`.

### Onboarding + Pulse Scheduling (How It Works)

- Connecting a tool (Google for v0) triggers two jobs:
  - `workspace_bootstrap` (build initial workspace/user context)
  - `nightly_workspace_run` with an **auto-first** key
- Auto-first is **per-user** (org-scale safe):
  - The auto-first `nightly_workspace_run` payload always includes `userId`, so the worker generates pulses for only the triggering user (no “fan out to every workspace member” surprise cost).
  - Auto-first enqueue does not require manager/admin role; normal employees should still get “wow from day one”.
  - Auto-first job run ids/keys are per-user: `...:<workspaceId>:<userId>` so one employee does not “claim” the workspace-wide first run.
- Daily scheduling is coverage-safe:
  - The worker’s `enqueue_due_daily_pulses` scans memberships using a DB cursor (`SchedulerState`) and a Postgres advisory lock so it eventually covers all org members (no “first N memberships forever” bug).
  - By default the scheduling window is **soft**: once local time is >= `STARB_DAILY_PULSE_WINDOW_START_HOUR` the user remains eligible for that day until run (sequential coverage). If you want a strict window, set `STARB_DAILY_PULSE_STRICT_WINDOW=1` and keep `STARB_DAILY_PULSE_WINDOW_END_HOUR`.
- “Instant” first pulse notification (no APNs, v1):
  - If the macOS app is signed in and sees an empty pulse, it temporarily increases refresh frequency (bounded ~20 minutes).
  - When the first pulse arrives, the app immediately schedules a local notification and stops the boost polling.

### Marketing Site (Vercel)

Create a separate Vercel project pointing at this repo with:

- Root Directory: `apps/site`
- Build Command: `pnpm install --frozen-lockfile && pnpm --filter @starbeam/site build`
- Output: default (Next.js)

Required env vars for the marketing site:

- `NEXT_PUBLIC_SITE_ORIGIN` (e.g. `https://starbeamhq.com`)
- `NEXT_PUBLIC_WEB_ORIGIN` (e.g. `https://app.starbeamhq.com`)
- `NEXT_PUBLIC_SUPPORT_EMAIL` (optional)

If you want the waitlist to write to Postgres from the marketing site, also set:

- `DATABASE_URL`

### Optional: Codex Exec (Nightly Pulse Synthesis)

If `STARB_CODEX_EXEC_ENABLED=1` is set, the worker will run `codex exec` over a
materialized context directory (source items + decrypted blobs) and store extra
INTERNAL + WEB_RESEARCH pulse cards (web search is enabled via `codex --search`).

When Codex is enabled and available, the legacy per-department web research pipeline
(OpenAI Responses `web_search`) is disabled by default. You can override this with:

- `STARB_LEGACY_DEPT_WEB_RESEARCH_ENABLED=1` to force-enable legacy
- `STARB_LEGACY_DEPT_WEB_RESEARCH_ENABLED=0` to force-disable legacy
- `STARB_CODEX_WEB_SEARCH_ENABLED=0` to keep Codex on internal-only synthesis

Install the Codex CLI and ensure `codex` is available on PATH for the worker runtime:

```bash
npm i -g @openai/codex
```

## Auth Environment Variables (Canonical + Compat)

Canonical names used by this repo:

- `AUTH_SECRET`
- `AUTH_URL`
- `NEXT_PUBLIC_WEB_ORIGIN`

Compatibility aliases (supported by the codebase, prefer canonical for new setups):

- `NEXTAUTH_SECRET` (alias of `AUTH_SECRET`)
- `NEXTAUTH_URL` (alias of `AUTH_URL`)

### Optional: Sync Local `.env` -> Render Env Vars

If you used `render login` locally, you can sync your gitignored `.env` values into Render:

```bash
python scripts/render_sync_env.py
```

This will:

- ensure `STARB_TOKEN_ENC_KEY_B64` exists (generates one if missing)
- update env vars on `starbeam-web` and `starbeam-worker`
- trigger deploys without clearing build cache
