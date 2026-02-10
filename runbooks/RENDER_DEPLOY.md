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

Bring-your-own Postgres (Neon recommended). Set `DATABASE_URL` for both services.

Apply Prisma migrations once after provisioning the DB:

```bash
export DATABASE_URL="postgresql://..."
pnpm install
pnpm --filter @starbeam/db exec prisma migrate deploy
```

## Required Environment Variables

Web (`starbeam-web`):

- `DATABASE_URL`
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
