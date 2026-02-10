# Repo Settings (Quality Baseline)

This file documents repo settings that cannot be enforced purely by code.

## Branch Protection (main)

Recommended rules for `main`:

- Require pull request before merging.
- Require at least 1 approval.
- Dismiss stale approvals when new commits are pushed.
- Require status checks to pass before merging:
  - `CI` (from `.github/workflows/ci.yml`)
- Require branches to be up to date before merging.
- Restrict force pushes and deletions on `main`.

## CODEOWNERS

If/when this becomes a multi-contributor repo, add CODEOWNERS to require reviews for high-impact paths:

- `apps/web/**`
- `apps/worker/**`
- `packages/db/**` (schema/migrations)

Suggested locations:

- `.github/CODEOWNERS` (preferred for GitHub)
- `CODEOWNERS` (repo root)

## Dependency Update Automation

Recommended:

- Enable Dependabot for npm (configured via `.github/dependabot.yml`).

## Required Local Checks (Policy)

Before opening a PR, run:

- `pnpm validate:fast`

And before merging / releasing, ensure:

- `pnpm build`
