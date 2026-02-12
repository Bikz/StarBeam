import assert from "node:assert/strict";
import test from "node:test";

import { parseUsageEventInput } from "../src/lib/usageEvents";

test("parseUsageEventInput accepts a valid usage event payload", () => {
  const parsed = parseUsageEventInput({
    eventType: "SIGNED_IN",
    source: "web",
    userId: "usr_123",
    metadata: { provider: "credentials" },
  });

  assert.equal(parsed.eventType, "SIGNED_IN");
  assert.equal(parsed.source, "web");
  assert.equal(parsed.userId, "usr_123");
});

test("parseUsageEventInput rejects unknown event types", () => {
  assert.throws(() => {
    parseUsageEventInput({
      eventType: "UNKNOWN_EVENT",
      source: "web",
      userId: "usr_123",
    });
  }, /Invalid usage event payload/);
});

test("parseUsageEventInput rejects unknown sources", () => {
  assert.throws(() => {
    parseUsageEventInput({
      eventType: "SIGNED_IN",
      source: "cli",
      userId: "usr_123",
    });
  }, /Invalid usage event payload/);
});

test("parseUsageEventInput requires eventType", () => {
  assert.throws(() => {
    parseUsageEventInput({
      source: "web",
      userId: "usr_123",
    });
  }, /Invalid usage event payload/);
});
