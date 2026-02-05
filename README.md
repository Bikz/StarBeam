# Starbeam

Starbeam is a macOS menu bar app + web dashboard that delivers a daily “pulse” for organizations and individuals: focused updates and suggested actions derived from company goals, announcements, connected tools (Google for v0), and nightly web research.

## Repo Status

This repository is being built from scratch. The internal planning docs live under `docs/`, which is intentionally gitignored and not published.

## Product Surfaces (v0)

- **macOS menu bar app (SwiftUI)**: daily pulse bump, Today’s Focus, Today’s Calendar, notifications, and quick actions.
- **Web dashboard (Next.js)**: auth, onboarding, workspace/org settings, goals/announcements, Google connections, pulse history/search, job status and “Run now”.
- **Worker (Node + Postgres queue)**: hourly sync + nightly ingestion + pulse generation jobs.

## Local Development (planned)

The project will use:

- `pnpm` + Turborepo monorepo
- Next.js + Tailwind for web
- Postgres + Prisma for data
- Graphile Worker for background jobs

Once scaffolding lands, this README will include exact commands to run the full stack locally.

