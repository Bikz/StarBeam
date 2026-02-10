# @starbeam/site

Marketing site for Starbeam (landing pages, waitlist, legal pages).

## Local Development

From the repo root:

```bash
# Marketing site (http://localhost:3001)
pnpm --filter @starbeam/site dev -- -p 3001
```

Environment variables live at the repo root (see `/.env.example`).

Minimum env vars:

- `NEXT_PUBLIC_SITE_ORIGIN` (usually `http://localhost:3001` in dev)
- `NEXT_PUBLIC_WEB_ORIGIN` (usually `http://app.localhost:3000` in dev)
- `NEXT_PUBLIC_SUPPORT_EMAIL` (optional)

Optional (only if you want `/waitlist` to write to Postgres):

- `DATABASE_URL`

## Deployment (Vercel)

Recommended deployment is a separate Vercel project pointing at this repo:

- Root Directory: `apps/site`
- Build Command: `pnpm install --frozen-lockfile && pnpm --filter @starbeam/site build`
- Output: default (Next.js)

Set the same env vars listed above in the Vercel project settings.
