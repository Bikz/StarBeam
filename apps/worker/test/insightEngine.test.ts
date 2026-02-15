import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPersonaSubmode,
  classifyPersonaTrack,
  recommendedFocusForPersona,
} from "../src/lib/insights/persona";
import {
  applySkillPolicy,
  allowPartnerSkills,
  shouldUseDiscoveredSkill,
} from "../src/lib/insights/policy";
import { rankInsightCards } from "../src/lib/insights/ranker";
import { skillsForPersona } from "../src/lib/insights/skillRegistry";

test("classifyPersonaTrack maps member size bands", () => {
  const solo = classifyPersonaTrack({
    memberCount: 1,
    activeMemberCount: 1,
    integrationCount: 1,
    openTaskCount: 3,
    hasPersonalProfile: true,
    hasGoals: true,
  });
  const small = classifyPersonaTrack({
    memberCount: 7,
    activeMemberCount: 6,
    integrationCount: 2,
    openTaskCount: 8,
    hasPersonalProfile: true,
    hasGoals: true,
  });
  const growth = classifyPersonaTrack({
    memberCount: 19,
    activeMemberCount: 15,
    integrationCount: 5,
    openTaskCount: 20,
    hasPersonalProfile: false,
    hasGoals: true,
  });

  assert.equal(solo, "SOLO_FOUNDER");
  assert.equal(small, "SMALL_TEAM_5_10");
  assert.equal(growth, "GROWTH_TEAM_11_50");
});

test("applySkillPolicy excludes partner skills when not eligible", () => {
  const skills = skillsForPersona("SOLO_FOUNDER");
  const includePartnerSkills = allowPartnerSkills({
    programType: "DESIGN_PARTNER",
    partnerSkillsFlagEnabled: false,
  });

  const filtered = applySkillPolicy({
    skills,
    includePartnerSkills,
    maxSkills: 10,
  });

  assert.equal(
    filtered.some((skill) => skill.source === "PARTNER"),
    false,
  );
});

test("rankInsightCards dedupes by title and keeps higher scoring card", () => {
  const ranked = rankInsightCards({
    explorationPct: 0,
    seed: "test-seed",
    cards: [
      {
        card: { id: "a" },
        title: "Ship onboarding checklist",
        kind: "INTERNAL",
        insightMeta: {
          personaTrack: "SOLO_FOUNDER",
          relevanceScore: 0.5,
          actionabilityScore: 0.5,
          confidenceScore: 0.4,
          noveltyScore: 0.4,
        },
      },
      {
        card: { id: "b" },
        title: "Ship onboarding checklist",
        kind: "INTERNAL",
        insightMeta: {
          personaTrack: "SOLO_FOUNDER",
          relevanceScore: 0.9,
          actionabilityScore: 0.9,
          confidenceScore: 0.8,
          noveltyScore: 0.7,
        },
      },
    ],
  });

  assert.equal(ranked.length, 1);
  assert.deepEqual(ranked[0]?.card, { id: "b" });
});

test("recommendedFocusForPersona returns actionable copy", () => {
  const text = recommendedFocusForPersona("SOLO_FOUNDER");
  assert.match(text, /marketing action/i);
});

test("classifyPersonaSubmode maps high-signal behavior patterns", () => {
  const shipHeavy = classifyPersonaSubmode({
    personaTrack: "SOLO_FOUNDER",
    activeMemberCount: 1,
    integrationCount: 1,
    openTaskCount: 6,
    hasGoals: true,
  });
  const alignmentGap = classifyPersonaSubmode({
    personaTrack: "SMALL_TEAM_5_10",
    activeMemberCount: 7,
    integrationCount: 1,
    openTaskCount: 9,
    hasGoals: true,
  });

  assert.equal(shipHeavy, "SHIP_HEAVY");
  assert.equal(alignmentGap, "ALIGNMENT_GAP");
});

test("shouldUseDiscoveredSkill enforces evaluator gate thresholds", () => {
  assert.equal(
    shouldUseDiscoveredSkill({
      skillRef: "x",
      source: "external",
      fitReason: "fit",
      risk: "low",
      expectedHelpfulLift: 0.12,
      expectedActionLift: 0.08,
      confidence: 0.7,
      decision: "USE",
    }),
    true,
  );
  assert.equal(
    shouldUseDiscoveredSkill({
      skillRef: "x",
      source: "external",
      fitReason: "fit",
      risk: "high",
      expectedHelpfulLift: 0.2,
      expectedActionLift: 0.15,
      confidence: 0.9,
      decision: "USE",
    }),
    false,
  );
});
