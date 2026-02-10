import * as Sentry from "@sentry/nextjs";

export async function register() {
  const dsn = (process.env.SENTRY_DSN ?? "").trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment:
      (process.env.SENTRY_ENVIRONMENT ?? "").trim() ||
      (process.env.NODE_ENV ?? "development"),
    tracesSampleRate: 0,
  });
}
