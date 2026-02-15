import assert from "node:assert/strict";
import test from "node:test";

import { deriveFirstPulseActivation } from "../src/lib/activationState";

function baseInput() {
  return {
    hasAnyPulse: false,
    hasGoogleConnection: true,
    googleAuthConfigured: true,
    queuedFromQueryParam: false,
    bootstrapStatus: null,
    autoFirstStatus: null,
    bootstrapErrorSummary: null,
    autoFirstErrorSummary: null,
  };
}

test("deriveFirstPulseActivation returns blocking when OAuth env is missing", () => {
  const activation = deriveFirstPulseActivation({
    ...baseInput(),
    googleAuthConfigured: false,
    hasGoogleConnection: false,
  });
  assert.equal(activation.state, "failed_blocking");
  assert.equal(activation.primaryAction, "open_integrations");
});

test("deriveFirstPulseActivation returns not_started when Google is disconnected", () => {
  const activation = deriveFirstPulseActivation({
    ...baseInput(),
    hasGoogleConnection: false,
  });
  assert.equal(activation.state, "not_started");
  assert.equal(activation.primaryAction, "connect_google");
});

test("deriveFirstPulseActivation returns queued and running states deterministically", () => {
  const queued = deriveFirstPulseActivation({
    ...baseInput(),
    queuedFromQueryParam: true,
  });
  assert.equal(queued.state, "queued");

  const running = deriveFirstPulseActivation({
    ...baseInput(),
    bootstrapStatus: "RUNNING",
  });
  assert.equal(running.state, "running");
});

test("deriveFirstPulseActivation marks stale queued/running jobs as retriable", () => {
  const activation = deriveFirstPulseActivation({
    ...baseInput(),
    autoFirstStatus: "RUNNING",
    autoFirstRunningAgeMins: 31,
    staleThresholdMins: 20,
  });
  assert.equal(activation.state, "failed_retriable");
  assert.equal(activation.primaryAction, "generate_now");
});

test("deriveFirstPulseActivation marks retriable failures", () => {
  const activation = deriveFirstPulseActivation({
    ...baseInput(),
    bootstrapStatus: "FAILED",
    bootstrapErrorSummary: "network timeout",
  });
  assert.equal(activation.state, "failed_retriable");
  assert.equal(activation.primaryAction, "generate_now");
});

test("deriveFirstPulseActivation marks blocking failures from config errors", () => {
  const activation = deriveFirstPulseActivation({
    ...baseInput(),
    autoFirstStatus: "FAILED",
    autoFirstErrorSummary: "Missing GOOGLE_CLIENT_ID",
  });
  assert.equal(activation.state, "failed_blocking");
});

test("deriveFirstPulseActivation returns ready when pulse already exists", () => {
  const activation = deriveFirstPulseActivation({
    ...baseInput(),
    hasAnyPulse: true,
  });
  assert.equal(activation.state, "ready");
  assert.equal(activation.primaryAction, "open_pulse");
});
