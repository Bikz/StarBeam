# Starbeam

Starbeam is a macOS menu bar app + web dashboard that delivers a daily “pulse” for organizations and individuals: focused updates and suggested actions derived from company goals, announcements, connected tools (Google for v0), and nightly web research.

## Repo Status

This repository is being built from scratch. The internal planning docs live under `docs/`, which is intentionally gitignored and not published.

## Product Surfaces (v0)

- **macOS menu bar app (SwiftUI)**: daily pulse bump, Today’s Focus, Today’s Calendar, notifications, and quick actions.
- **Web dashboard (Next.js)**: auth, onboarding, workspace/org settings, goals/announcements, Google connections, pulse history/search, job status and “Run now”.
- **Worker (Node + Postgres queue)**: hourly sync + nightly ingestion + pulse generation jobs.

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

## Production Deploy (Render + Neon)

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

### 4) Verify

- Open the deployed web URL, sign in, create an org workspace, and trigger “Run now”.
- Confirm `starbeam-worker` is running and connected to the same `DATABASE_URL`.

### Optional: Sync Local `.env` -> Render Env Vars

If you used `render login` locally, you can sync your gitignored `.env` values into Render:

```bash
python scripts/render_sync_env.py
```

This will:

- ensure `STARB_TOKEN_ENC_KEY_B64` exists (generates one if missing)
- update env vars on `starbeam-web` and `starbeam-worker`
- trigger deploys without clearing build cache
