import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGoalHelpfulnessEvaluatorPrompt,
  buildSkillDiscoveryPrompt,
} from "../src/lib/insights/skillDiscovery";

test("buildSkillDiscoveryPrompt includes persona, goals, and advisory guardrails", () => {
  const prompt = buildSkillDiscoveryPrompt({
    workspaceName: "Acme",
    personaTrack: "SOLO_FOUNDER",
    allowedSkillRefs: ["core-prioritization-v1", "rice-prioritization-v1"],
    profile: {
      websiteUrl: "https://acme.example",
      description: "AI workflow tool",
      competitorDomains: ["competitor.example"],
    },
    goals: [
      {
        title: "Improve activation",
        body: "Lift first value in 24h",
        priority: "HIGH",
      },
    ],
    tasks: [
      {
        title: "Ship onboarding improvements",
        status: "OPEN",
        sourceType: "MANUAL",
      },
    ],
  });

  assert.match(prompt, /Persona track: SOLO_FOUNDER/);
  assert.match(prompt, /Improve activation/);
  assert.match(prompt, /advisory-only recommendations only/i);
  assert.match(prompt, /skills\.sh/i);
});

test("buildGoalHelpfulnessEvaluatorPrompt includes candidate + submode context", () => {
  const prompt = buildGoalHelpfulnessEvaluatorPrompt({
    workspaceName: "Acme",
    personaTrack: "SOLO_FOUNDER",
    personaSubmode: "SHIP_HEAVY",
    goals: [{ title: "Increase activation", body: null, priority: "HIGH" }],
    tasks: [
      {
        title: "Ship onboarding improvements",
        status: "OPEN",
        sourceType: "MANUAL",
      },
    ],
    candidate: {
      skillRef: "growth-loop-v1",
      source: "external",
      fitReason: "Strong fit",
      expectedLift: {
        helpfulRatePct: 14,
        actionCompletionRatePct: 11,
      },
      risk: "low",
      guardrails: ["advisory only"],
      experimentPlan: {
        cohort: "design partners",
        durationDays: 7,
        successMetric: "helpful rate",
      },
    },
  });

  assert.match(prompt, /Persona submode: SHIP_HEAVY/);
  assert.match(prompt, /growth-loop-v1/);
  assert.match(prompt, /advisory-only constraint/i);
});
