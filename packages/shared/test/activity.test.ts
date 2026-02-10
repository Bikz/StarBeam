import assert from "node:assert/strict";
import test from "node:test";

import {
  isActiveWithinWindow,
  shouldUpdateLastActiveAt,
} from "../src/activity";

test("isActiveWithinWindow: inactive when lastActiveAt is null", () => {
  const now = new Date("2026-02-10T12:00:00.000Z");
  assert.equal(
    isActiveWithinWindow({ lastActiveAt: null, now, windowDays: 7 }),
    false,
  );
});

test("isActiveWithinWindow: active when within window", () => {
  const now = new Date("2026-02-10T12:00:00.000Z");
  const lastActiveAt = new Date("2026-02-08T12:00:00.000Z");
  assert.equal(
    isActiveWithinWindow({ lastActiveAt, now, windowDays: 7 }),
    true,
  );
});

test("isActiveWithinWindow: inactive when outside window", () => {
  const now = new Date("2026-02-10T12:00:00.000Z");
  const lastActiveAt = new Date("2026-02-01T11:59:59.000Z");
  assert.equal(
    isActiveWithinWindow({ lastActiveAt, now, windowDays: 7 }),
    false,
  );
});

test("shouldUpdateLastActiveAt: updates when lastActiveAt is null", () => {
  const now = new Date("2026-02-10T12:00:00.000Z");
  assert.equal(
    shouldUpdateLastActiveAt({ lastActiveAt: null, now, throttleMins: 60 }),
    true,
  );
});

test("shouldUpdateLastActiveAt: does not update within throttle window", () => {
  const now = new Date("2026-02-10T12:00:00.000Z");
  const lastActiveAt = new Date("2026-02-10T11:30:00.000Z");
  assert.equal(
    shouldUpdateLastActiveAt({ lastActiveAt, now, throttleMins: 60 }),
    false,
  );
});

test("shouldUpdateLastActiveAt: updates when older than throttle window", () => {
  const now = new Date("2026-02-10T12:00:00.000Z");
  const lastActiveAt = new Date("2026-02-10T10:59:59.000Z");
  assert.equal(
    shouldUpdateLastActiveAt({ lastActiveAt, now, throttleMins: 60 }),
    true,
  );
});
