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
  job?: {
    id?: string | number;
    attempt?: number;
    maxAttempts?: number;
  };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}): void {
  const dsn = (process.env.SENTRY_DSN ?? "").trim();
  if (!dsn) return;

  const jobTags: Record<string, string> = {};
  if (args.job?.id !== undefined) jobTags.jobId = String(args.job.id);
  if (typeof args.job?.attempt === "number")
    jobTags.jobAttempt = String(args.job.attempt);
  if (typeof args.job?.maxAttempts === "number")
    jobTags.jobMaxAttempts = String(args.job.maxAttempts);

  const safeExtra = args.extra ? safeJson(args.extra, 16_000) : null;
  const safeExtraObj =
    safeExtra && typeof safeExtra === "object"
      ? (safeExtra as Record<string, unknown>)
      : safeExtra !== null
        ? { extra: safeExtra }
        : {};

  Sentry.captureException(args.error, {
    tags: { task: args.task, ...jobTags, ...(args.tags ?? {}) },
    extra: {
      payload: safeJson(args.payload, 16_000),
      ...safeExtraObj,
    },
  });
}
