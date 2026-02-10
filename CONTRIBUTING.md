# Contributing

This repo is a pnpm + Turborepo monorepo.

## Prereqs

- Node.js 20.x (see `package.json#engines`)
- pnpm (see `package.json#packageManager`)
- Docker (for local Postgres + MinIO)

## Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm --filter @starbeam/db prisma:migrate
```

Notes:

- `prisma:migrate` runs `prisma migrate deploy` (safe for applying existing migrations).
- When authoring new schema changes locally, use `pnpm --filter @starbeam/db prisma:migrate:dev`.

## Day-to-Day Commands

Run apps:

```bash
# Web dashboard (http://localhost:3000)
pnpm --filter @starbeam/web dev

# Marketing site (http://localhost:3001)
pnpm --filter @starbeam/site dev -- -p 3001

# Worker (background jobs)
pnpm --filter @starbeam/worker dev
```

Fast validation (recommended before opening a PR):

```bash
pnpm validate:fast
```

Full validation:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Formatting:

```bash
pnpm format
pnpm format:check
```

## E2E Smoke Tests

We use Playwright for E2E smoke coverage of core journeys.

```bash
pnpm e2e
```

Note: E2E tests require the web server to expose test-only endpoints under `/api/test/*`.
They are disabled by default and are guarded by:

- `NODE_ENV != production`
- `STARB_TEST_ENDPOINTS=1`

See `apps/web/README.md` for details.

## Doc Hygiene

- `README.md` is the primary onboarding and ops entrypoint.
- Internal notes live under `docs/` (gitignored) and must not contradict committed docs.
- If you change behavior, update docs and runbooks in the same PR.
