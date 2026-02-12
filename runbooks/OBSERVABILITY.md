# Observability

This repo uses Sentry as the default baseline for production error reporting for:

- `apps/web` (Next.js dashboard + API)
- `apps/worker` (Graphile Worker jobs runner)

## Environment Variables

To enable Sentry, set:

- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT` (recommended: `production`, `staging`, `development`)

If `SENTRY_DSN` is unset/empty, Sentry is disabled.

## What To Look At First

When debugging an incident:

1. Web service errors (Next.js route/API exceptions)
2. Worker errors (task failures; look for `task` and `jobRunId` metadata)
3. Correlate to DB `JobRun` rows for nightly runs and scheduled work

## Local Testing

You can set `SENTRY_DSN` in `.env` and force an error in a dev environment to confirm events are delivered.

## Admin Ops Metrics API

For launch ops, use `GET /api/admin/ops/metrics` for a DB-backed snapshot of:

- recent `JobRun` outcomes (last 24h)
- connector health by provider (`CONNECTED`/`ERROR`/`REVOKED`)
- stale connector poll backlog (`lastAttemptedAt` older than poll cutoff)

Access control:

- allowed for signed-in admin users (`STARB_ADMIN_EMAILS`)
- or a static bearer token via `STARB_OPS_METRICS_TOKEN`

Example:

```bash
curl -sS \
  -H "Authorization: Bearer $STARB_OPS_METRICS_TOKEN" \
  https://starbeamhq.com/api/admin/ops/metrics | jq
```
