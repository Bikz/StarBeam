import assert from "node:assert/strict";
import test from "node:test";

import { decidePulseGate } from "../src/lib/pulseOnboardingGating";

test("(no editions, onboarding null) -> redirect onboarding", () => {
  const gate = decidePulseGate({
    editionsCount: 0,
    onboardingEnabled: true,
    onboardingCompletedAt: null,
  });
  assert.equal(gate.kind, "redirect_onboarding");
});

test("(no editions, onboarding set) -> render generating", () => {
  const gate = decidePulseGate({
    editionsCount: 0,
    onboardingEnabled: true,
    onboardingCompletedAt: new Date("2026-02-15T00:00:00Z"),
  });
  assert.equal(gate.kind, "render_generating");
});

test("(has editions) -> render pulse", () => {
  const gate = decidePulseGate({
    editionsCount: 1,
    onboardingEnabled: true,
    onboardingCompletedAt: null,
  });
  assert.equal(gate.kind, "render_pulse");
});

test("when onboarding is disabled, never redirects", () => {
  const gate = decidePulseGate({
    editionsCount: 0,
    onboardingEnabled: false,
    onboardingCompletedAt: null,
  });
  assert.equal(gate.kind, "render_generating");
});
