# Rollback

This repo has multiple deploy surfaces. Rollback strategies depend on what changed.

## Web + Worker (Render)

### Code-only rollback

If the issue is code-only (no migrations required):

1. Identify the last known good commit.
2. Redeploy that commit for `starbeam-web` and/or `starbeam-worker` in Render.
3. Verify:
   - `GET /api/health` returns 200
   - sign-in works
   - worker is processing jobs

### Database migrations

If a deploy included a Prisma migration:

- Prisma migrations are applied at runtime in production. A rollback may require a compensating migration.
- Do not "delete" migrations in prod. Create a new migration that restores the prior schema behavior.

## Marketing Site (Vercel)

Vercel rollbacks are typically handled by promoting a previous deployment to production in the Vercel UI.

## macOS App (Sparkle)

If a release is broken:

- Pull/replace the published `appcast.xml` and point it back to the last good version.
- Ensure the older update artifacts remain available at the same origin as `SUFeedURL`.

See `apps/macos/Starbeam/RELEASING.md`.
