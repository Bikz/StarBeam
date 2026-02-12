import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOnboardingPayload,
  inferPulseLane,
  pulseSourceLabel,
} from "../src/lib/macosOverviewPresentation";

test("buildOnboardingPayload: returns SETUP until checklist is complete", () => {
  const payload = buildOnboardingPayload({
    workspaceSlug: "acme",
    hasPersonalProfile: true,
    hasPersonalGoal: false,
    hasIntegration: false,
  });

  assert.equal(payload.mode, "SETUP");
  assert.equal(payload.checklist[0]?.status, "DONE");
  assert.equal(payload.checklist[1]?.status, "TODO");
  assert.equal(payload.checklist[2]?.status, "TODO");
});

test("buildOnboardingPayload: returns DAILY when setup is done", () => {
  const payload = buildOnboardingPayload({
    workspaceSlug: "acme",
    hasPersonalProfile: true,
    hasPersonalGoal: true,
    hasIntegration: true,
  });

  assert.equal(payload.mode, "DAILY");
  assert.equal(payload.checklist.every((item) => item.status === "DONE"), true);
});

test("inferPulseLane: identifies onboarding internal cards in setup mode", () => {
  const onboarding = buildOnboardingPayload({
    workspaceSlug: "acme",
    hasPersonalProfile: false,
    hasPersonalGoal: false,
    hasIntegration: false,
  });

  const lane = inferPulseLane({
    onboardingMode: onboarding.mode,
    onboardingChecklist: onboarding.checklist,
    kind: "INTERNAL",
    title: "Complete your personal profile",
    body: "Add your role, focus, and context.",
    action: "Open Profile and add job title + about section.",
  });

  assert.equal(lane, "ONBOARDING");
});

test("inferPulseLane: keeps non-setup cards in daily lane", () => {
  const onboarding = buildOnboardingPayload({
    workspaceSlug: "acme",
    hasPersonalProfile: false,
    hasPersonalGoal: false,
    hasIntegration: false,
  });

  const lane = inferPulseLane({
    onboardingMode: onboarding.mode,
    onboardingChecklist: onboarding.checklist,
    kind: "WEB_RESEARCH",
    title: "Trend shift",
    body: "New signal from the market.",
    action: null,
  });

  assert.equal(lane, "DAILY");
});

test("pulseSourceLabel: uses citation host for web research", () => {
  const label = pulseSourceLabel({
    lane: "DAILY",
    kind: "WEB_RESEARCH",
    title: "Market signal",
    citations: [{ url: "https://www.reddit.com/r/startups", title: "" }],
  });

  assert.equal(label, "reddit.com");
});

test("pulseSourceLabel: uses setup label for onboarding cards", () => {
  const label = pulseSourceLabel({
    lane: "ONBOARDING",
    kind: "INTERNAL",
    title: "Connect one integration",
    citations: [],
  });

  assert.equal(label, "Setup");
});
