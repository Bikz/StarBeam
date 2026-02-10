# Render Deploy (Dashboard + Worker)

Render is the recommended host for:

- `apps/web` (dashboard + API)
- `apps/worker` (jobs runner)

This repo includes a Render Blueprint at `render.yaml`.

## Create Services

In the Render dashboard:

1. New -> Blueprint -> select this repo (must contain `render.yaml`)
2. Configure env vars for:
   - `starbeam-web`
   - `starbeam-worker`

## Database

Bring-your-own Postgres (Neon recommended).

Set:

- `DATABASE_URL` (may be Neon pooled/pooler; used at runtime)
- `DIRECT_DATABASE_URL` (Neon direct/non-pooler; used for Prisma migrations on deploy)

Apply Prisma migrations once after provisioning the DB:

```bash
export DATABASE_URL="postgresql://..."
export DIRECT_DATABASE_URL="postgresql://..."
pnpm install
pnpm --filter @starbeam/db prisma:migrate
```

## Quick Verification (Auto-Deploy + Migrations)

After pushing a commit to `main`, verify the deploy ran migrations in pre-deploy and the service started quickly.

1. In the Render deploy logs for `starbeam-web`, confirm you see:
   - `Starting pre-deploy: ... prisma migrate deploy`
   - `Pre-deploy complete!`
2. In the Prisma output, confirm it either applies migrations or prints `No pending migrations to apply.`
3. Confirm the service is `live` and `GET /api/health` returns `200`.

## Avoid Duplicate Builds / Overlapping Deploys

Render deploys can overlap when multiple triggers fire for the same commit (for example: auto-deploy from a git push plus an API-triggered deploy from an env-sync script). This often shows up as "Deploy canceled… Another deploy started."

To keep deploys clean and avoid duplicate builds:

1. Prefer auto-deploy on git push for routine changes.
2. Only run `scripts/render_sync_env.py` / `scripts/render_set_email_env.py` when you actually changed env vars.
3. Those scripts do **not** trigger deploys by default. If you need them to, pass `--deploy`.

## Required Environment Variables

Web (`starbeam-web`):

- `DATABASE_URL`
- `DIRECT_DATABASE_URL` (Neon direct/non-pooler)
- `AUTH_SECRET`
- `AUTH_URL`
- `NEXT_PUBLIC_WEB_ORIGIN`
- Email: `SMTP_*` + `EMAIL_FROM` (preferred) or `RESEND_API_KEY` + `EMAIL_FROM` (fallback)
- Optional: `STARB_ADMIN_EMAILS` (admin allowlist bypasses beta gate)

Worker (`starbeam-worker`):

- `DATABASE_URL`
- `STARB_TOKEN_ENC_KEY_B64`
- `OPENAI_API_KEY` (if using AI/research features)
- Optional: `STARB_CODEX_EXEC_ENABLED` and related Codex env vars
- Blob store: `S3_*` (required when using blob-backed features and/or Codex exec in production)

## Health Checks

Render uses `/api/health` on the web service (see `render.yaml`).

## Staging + Canary (Recommended)

Render does not provide a first-class "percentage rollout" for a single service. The practical strategy we use is:

1. Maintain separate environments:
   - `staging` (separate Render services + separate Postgres + separate blob bucket)
   - `production`
2. For risky changes, create a short-lived canary service:
   - `starbeam-web-canary` and/or `starbeam-worker-canary`
   - Point it at the staging database first, validate, then point it at production only when safe
3. Roll forward or rollback:
   - Roll forward by promoting the commit to production services
   - Rollback by redeploying the last known good commit

Document any environment-specific differences (domains, OAuth redirect URIs, blob buckets) before attempting a canary.
