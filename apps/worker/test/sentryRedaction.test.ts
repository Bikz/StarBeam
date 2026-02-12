import assert from "node:assert/strict";
import test from "node:test";

import {
  redactTelemetryValue,
  sanitizeTelemetryValue,
} from "../src/lib/sentry";

test("redactTelemetryValue redacts sensitive keys", () => {
  const out = redactTelemetryValue({
    workspaceId: "ws_123",
    refreshToken: "secret-token-value",
    nested: {
      email: "user@example.com",
      body: "raw payload",
      ok: true,
    },
  }) as Record<string, unknown>;

  assert.equal(out.workspaceId, "ws_123");
  assert.equal(out.refreshToken, "[REDACTED]");

  const nested = out.nested as Record<string, unknown>;
  assert.equal(nested.email, "[REDACTED]");
  assert.equal(nested.body, "[REDACTED]");
  assert.equal(nested.ok, true);
});

test("redactTelemetryValue redacts token-like and email-like strings", () => {
  const out = redactTelemetryValue([
    "person@example.com",
    "Bearer abcdefghijklmnopqrstuvwxyz1234567890",
    "normal value",
  ]) as unknown[];

  assert.equal(out[0], "[REDACTED_EMAIL]");
  assert.equal(out[1], "[REDACTED]");
  assert.equal(out[2], "normal value");
});

test("redactTelemetryValue truncates deeply nested structures", () => {
  const out = redactTelemetryValue({
    a: { b: { c: { d: { e: "too deep" } } } },
  }) as Record<string, unknown>;

  const a = out.a as Record<string, unknown>;
  const b = a.b as Record<string, unknown>;
  const c = b.c as Record<string, unknown>;
  const d = c.d as Record<string, unknown>;

  assert.equal(d.__truncated, true);
  assert.equal(d.reason, "max_depth");
});

test("sanitizeTelemetryValue enforces max bytes", () => {
  const out = sanitizeTelemetryValue(
    { large: { values: Array.from({ length: 200 }, () => "x".repeat(200)) } },
    200,
  ) as Record<string, unknown>;

  assert.equal(out.__truncated, true);
  assert.equal(typeof out.length, "number");
});
