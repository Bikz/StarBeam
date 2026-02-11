import assert from "node:assert/strict";
import test from "node:test";

import { buildDeterministicFallbackInternalCards } from "../src/tasks/nightlyWorkspaceRunHelpers";

test("buildDeterministicFallbackInternalCards fills to minimum count", () => {
  const cards = buildDeterministicFallbackInternalCards({
    minCards: 5,
    maxCards: 7,
    existingCount: 1,
    existingTitles: new Set(["Existing card"]),
    workspaceName: "Acme",
    personalProfile: null,
    personalGoals: [],
    workspaceGoals: [],
    tasks: [],
    sourceItems: [],
  });

  assert.equal(cards.length, 4);
  for (const card of cards) {
    assert.equal(card.kind, "INTERNAL");
    assert.ok(card.title.length > 0);
    assert.ok(card.action.length > 0);
  }
});

test("buildDeterministicFallbackInternalCards avoids duplicate titles", () => {
  const existingTitle = "Capture your next 3 tasks";

  const cards = buildDeterministicFallbackInternalCards({
    minCards: 5,
    maxCards: 7,
    existingCount: 4,
    existingTitles: new Set([existingTitle]),
    workspaceName: "Acme",
    personalProfile: { jobTitle: "PM", about: "Planning releases" },
    personalGoals: [
      {
        id: "pg_1",
        title: "Ship onboarding",
        body: "Finish setup and launch docs.",
        active: true,
        targetWindow: "This month",
      },
    ],
    workspaceGoals: [],
    tasks: [
      {
        id: "t_1",
        title: "Review changelog",
        body: "Read release diff.",
        status: "OPEN",
        dueAt: null,
        snoozedUntil: null,
        updatedAt: new Date("2026-02-11T00:00:00.000Z"),
        sourceItem: null,
      },
    ],
    sourceItems: [],
  });

  assert.equal(cards.length, 1);
  assert.notEqual(cards[0]?.title, existingTitle);
});
