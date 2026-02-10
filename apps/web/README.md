# @starbeam/web

Starbeam web dashboard + API (Next.js App Router).

Key features:

- Auth: email 6-digit code (primary) + optional Google OAuth sign-in
- Private beta gate (invite keys + referrals; admin allowlist bypass)
- Workspace setup (profile, tracks/departments, goals, announcements, integrations)
- Job orchestration UI ("Run now", job status)
- macOS device auth + overview API (`/api/v1/*`)

## Local Development

From the repo root:

```bash
# Dashboard (http://localhost:3000)
pnpm --filter @starbeam/web dev
```

Environment variables live at the repo root (see `/.env.example`).

Minimum env vars for local dev:

- `DATABASE_URL` (use `docker compose up -d` from the repo root)
- `AUTH_SECRET`
- `AUTH_URL`
- `NEXT_PUBLIC_WEB_ORIGIN`

Common additions:

- `STARB_ADMIN_EMAILS` (comma-separated; bypasses beta gate for internal testing)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (optional, enables "Sign in with Google")
- Email:
  - Preferred: `SMTP_HOST` + `SMTP_*` + `EMAIL_FROM`
  - Fallback: `RESEND_API_KEY` + `EMAIL_FROM`

## Health Check

- `GET /api/health` returns 200 (used by Render health checks).

## Test-Only Endpoints (E2E)

For Playwright smoke tests we expose test-only routes under `/api/test/*`.

They are disabled by default and require:

- `NODE_ENV != production`
- `STARB_TEST_ENDPOINTS=1`

See `/.github/workflows/ci.yml` and the root `playwright.config.ts` for how CI enables them.
