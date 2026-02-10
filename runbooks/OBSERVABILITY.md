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
