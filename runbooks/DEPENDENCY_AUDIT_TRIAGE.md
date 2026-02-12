# Dependency Audit Triage

## Policy

- CI hard-fails on `high` and `critical` vulnerabilities via `pnpm audit --audit-level high`.
- `moderate` and below are tracked here as a backlog with a concrete upgrade plan.

## How To Update This List

1. Run `pnpm audit --audit-level moderate`.
2. Copy the findings into **Current Moderate Backlog** with the date.
3. If a finding is fixed (dependency upgrades), remove it and note the change.

## Current Moderate Backlog (2026-02-12)

All current moderate findings are transitive dependencies pulled in via the Prisma CLI dev tooling (`@prisma/dev`). They do **not** ship in the runtime bundles for the web app or worker, but we still track them to ensure they get cleaned up as upstream updates land.

- `lodash` (GHSA-xxjr-mmjv-4gpg)
  - Issue: Prototype Pollution in `_.unset` and `_.omit`.
  - Vulnerable: `>=4.0.0 <=4.17.22`
  - Patched: `>=4.17.23`
  - Path: `packages/db > prisma > @prisma/dev > @mrleebo/prisma-ast > chevrotain > lodash`
- `hono` (GHSA-9r54-q6cx-xmh5)
  - Issue: XSS through `ErrorBoundary` component.
  - Vulnerable: `<4.11.7`
  - Patched: `>=4.11.7`
  - Path: `packages/db > prisma > @prisma/dev > hono`
- `hono` (GHSA-6wqw-2p9w-4vw4)
  - Issue: Cache middleware ignores `Cache-Control: private` (Web Cache Deception).
  - Vulnerable: `<4.11.7`
  - Patched: `>=4.11.7`
  - Path: `packages/db > prisma > @prisma/dev > hono`
- `hono` (GHSA-r354-f388-2fhh)
  - Issue: IPv4 validation bypass in IP restriction middleware.
  - Vulnerable: `<4.11.7`
  - Patched: `>=4.11.7`
  - Path: `packages/db > prisma > @prisma/dev > hono`
- `hono` (GHSA-w332-q679-j88p)
  - Issue: Arbitrary key read in static middleware (Cloudflare Workers adapter).
  - Vulnerable: `<4.11.7`
  - Patched: `>=4.11.7`
  - Path: `packages/db > prisma > @prisma/dev > hono`

## Remediation Plan

1. Prefer upgrading `prisma`/`@prisma/client` when upstream releases pull patched transitive versions.
2. Avoid pinning transitive dependencies unless required (keep the fix upstream-driven).
3. If these remain unresolved for an extended period, consider isolating Prisma CLI tooling to a dedicated workspace to limit blast radius.
