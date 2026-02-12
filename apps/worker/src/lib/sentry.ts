import * as Sentry from "@sentry/node";

const TELEMETRY_MAX_BYTES = 16_000;
const TELEMETRY_MAX_DEPTH = 4;
const TELEMETRY_MAX_KEYS = 40;
const TELEMETRY_MAX_ARRAY_ITEMS = 25;
const TELEMETRY_MAX_STRING_LENGTH = 256;

const SENSITIVE_KEY_PATTERN =
  /(?:token|secret|password|api[-_]?key|authorization|cookie|session|refresh|access[_-]?token|otp|code|email|body|text|html|prompt|input|output|credential)/i;
const EMAIL_VALUE_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKENISH_VALUE_PATTERN = /^(?:Bearer\s+)?[A-Za-z0-9+/_\-.=]{24,}$/;

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function redactString(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (EMAIL_VALUE_PATTERN.test(trimmed)) return "[REDACTED_EMAIL]";
  if (TOKENISH_VALUE_PATTERN.test(trimmed)) return "[REDACTED]";
  if (value.length > TELEMETRY_MAX_STRING_LENGTH) {
    return { __truncated: true, length: value.length };
  }
  return value;
}

function redactByKey(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return "[REDACTED]";
  return value;
}

export function redactTelemetryValue(
  value: unknown,
  depth = 0,
  parentKey?: string,
): unknown {
  const keyRedacted =
    typeof parentKey === "string" ? redactByKey(parentKey, value) : value;
  if (keyRedacted === "[REDACTED]") return keyRedacted;
  value = keyRedacted;

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") return redactString(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return { __bytes: value.byteLength };

  if (depth >= TELEMETRY_MAX_DEPTH) {
    return { __truncated: true, reason: "max_depth" };
  }

  if (Array.isArray(value)) {
    const redactedItems = value
      .slice(0, TELEMETRY_MAX_ARRAY_ITEMS)
      .map((item) => redactTelemetryValue(item, depth + 1));
    if (value.length > TELEMETRY_MAX_ARRAY_ITEMS) {
      redactedItems.push({
        __truncated: true,
        omittedItems: value.length - TELEMETRY_MAX_ARRAY_ITEMS,
      });
    }
    return redactedItems;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    const out: Record<string, unknown> = {};
    for (const key of keys.slice(0, TELEMETRY_MAX_KEYS)) {
      out[key] = redactTelemetryValue(value[key], depth + 1, key);
    }
    if (keys.length > TELEMETRY_MAX_KEYS) {
      out.__truncatedKeys = keys.length - TELEMETRY_MAX_KEYS;
    }
    return out;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }

  return { __type: Object.prototype.toString.call(value) };
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

export function sanitizeTelemetryValue(
  value: unknown,
  maxBytes = TELEMETRY_MAX_BYTES,
): unknown {
  return safeJson(redactTelemetryValue(value), maxBytes);
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

  const safeExtra = args.extra ? sanitizeTelemetryValue(args.extra) : null;
  const safeExtraObj =
    safeExtra && typeof safeExtra === "object"
      ? (safeExtra as Record<string, unknown>)
      : safeExtra !== null
        ? { extra: safeExtra }
        : {};

  Sentry.captureException(args.error, {
    tags: { task: args.task, ...jobTags, ...(args.tags ?? {}) },
    extra: {
      payload: sanitizeTelemetryValue(args.payload),
      ...safeExtraObj,
    },
  });
}
