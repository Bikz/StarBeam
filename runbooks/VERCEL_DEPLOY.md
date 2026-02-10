# Vercel Deploy (Marketing Site)

Vercel is the recommended host for the marketing site:

- `apps/site`

## Create Project

Create a Vercel project pointing at this repo with:

- Root Directory: `apps/site`
- Build Command: `pnpm install --frozen-lockfile && pnpm --filter @starbeam/site build`
- Output: default (Next.js)

## Environment Variables

Required:

- `NEXT_PUBLIC_SITE_ORIGIN` (e.g. `https://starbeamhq.com`)
- `NEXT_PUBLIC_WEB_ORIGIN` (e.g. `https://app.starbeamhq.com`)

Optional:

- `NEXT_PUBLIC_SUPPORT_EMAIL`

Optional (only if you want `/waitlist` to write to Postgres):

- `DATABASE_URL`
