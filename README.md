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

## Local Development

### Requirements

- Node.js >= 20
- pnpm (see `package.json#packageManager`)
- Docker (for Postgres + MinIO)

### Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm --filter @starbeam/db prisma:migrate
```

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
- `STARB_CODEX_EXEC_ENABLED` (optional: set `1` to run `codex exec` for INTERNAL pulse synthesis)
- `STARB_CODEX_MODEL_DEFAULT` (optional: defaults to `gpt-5.2-codex`)
- `STARB_LEGACY_DEPT_WEB_RESEARCH_ENABLED` (optional: force-enable/disable the legacy dept web research pipeline)
- `S3_ENDPOINT` (S3-compatible endpoint; MinIO locally, R2 in hosted)
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET` (used for encrypted Drive snapshots and attachments)

### 4) Verify

- Open the deployed web URL, sign in, create an org workspace, and trigger “Run now”.
- Confirm `starbeam-worker` is running and connected to the same `DATABASE_URL`.

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

Install the Codex CLI and ensure `codex` is available on PATH for the worker runtime:

```bash
npm i -g @openai/codex
```

### Optional: Sync Local `.env` -> Render Env Vars

If you used `render login` locally, you can sync your gitignored `.env` values into Render:

```bash
python scripts/render_sync_env.py
```

This will:

- ensure `STARB_TOKEN_ENC_KEY_B64` exists (generates one if missing)
- update env vars on `starbeam-web` and `starbeam-worker`
- trigger deploys without clearing build cache
