import assert from "node:assert/strict";
import test from "node:test";

import {
  isFirstPulseRetryEnabled,
  parseAutoFirstUserId,
  shouldRetryFirstPulseFailure,
} from "../src/tasks/retryFailedFirstPulses";

test("isFirstPulseRetryEnabled defaults off in production and on in non-production", () => {
  assert.equal(isFirstPulseRetryEnabled({ NODE_ENV: "production" }), false);
  assert.equal(isFirstPulseRetryEnabled({ NODE_ENV: "development" }), true);
});

test("isFirstPulseRetryEnabled respects explicit flag", () => {
  assert.equal(
    isFirstPulseRetryEnabled({
      NODE_ENV: "production",
      STARB_FIRST_PULSE_AUTO_RETRY_V1: "1",
    }),
    true,
  );
  assert.equal(
    isFirstPulseRetryEnabled({
      NODE_ENV: "development",
      STARB_FIRST_PULSE_AUTO_RETRY_V1: "0",
    }),
    false,
  );
});

test("parseAutoFirstUserId prefers meta.userId and falls back to jobRun id", () => {
  assert.equal(
    parseAutoFirstUserId({
      jobRunId: "auto-first:w_123:u_123",
      meta: { userId: "u_meta" },
    }),
    "u_meta",
  );
  assert.equal(
    parseAutoFirstUserId({
      jobRunId: "auto-first:w_123:u_123",
      meta: null,
    }),
    "u_123",
  );
});

test("shouldRetryFirstPulseFailure enforces blocking and guardrails", () => {
  assert.equal(
    shouldRetryFirstPulseFailure({
      failureClass: "blocking",
      retryAttempt: 0,
      maxAttempts: 3,
      hasReadyPulse: false,
      hasActiveRetryRun: false,
    }),
    false,
  );
  assert.equal(
    shouldRetryFirstPulseFailure({
      failureClass: "retriable",
      retryAttempt: 3,
      maxAttempts: 3,
      hasReadyPulse: false,
      hasActiveRetryRun: false,
    }),
    false,
  );
  assert.equal(
    shouldRetryFirstPulseFailure({
      failureClass: "retriable",
      retryAttempt: 1,
      maxAttempts: 3,
      hasReadyPulse: true,
      hasActiveRetryRun: false,
    }),
    false,
  );
  assert.equal(
    shouldRetryFirstPulseFailure({
      failureClass: "retriable",
      retryAttempt: 1,
      maxAttempts: 3,
      hasReadyPulse: false,
      hasActiveRetryRun: true,
    }),
    false,
  );
  assert.equal(
    shouldRetryFirstPulseFailure({
      failureClass: "retriable",
      retryAttempt: 1,
      maxAttempts: 3,
      hasReadyPulse: false,
      hasActiveRetryRun: false,
    }),
    true,
  );
});
