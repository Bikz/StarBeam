import * as Sentry from "@sentry/node";

export function initSentry(): void {
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

function safeJson(value: unknown, maxBytes: number): unknown {
  try {
    const s = JSON.stringify(value);
    if (s.length <= maxBytes) return value;
    return { __truncated: true, length: s.length };
  } catch {
    return { __unserializable: true };
  }
}

export function captureTaskError(args: {
  task: string;
  error: unknown;
  payload: unknown;
}): void {
  const dsn = (process.env.SENTRY_DSN ?? "").trim();
  if (!dsn) return;

  Sentry.captureException(args.error, {
    tags: { task: args.task },
    extra: { payload: safeJson(args.payload, 16_000) },
  });
}
