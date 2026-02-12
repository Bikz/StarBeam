import assert from "node:assert/strict";
import test from "node:test";

import { selectPairsRoundRobin } from "../src/lib/roundRobin";

test("selectPairsRoundRobin interleaves connector lists", () => {
  const g = [
    { workspaceId: "w", userId: "g1" },
    { workspaceId: "w", userId: "g2" },
  ];
  const h = [
    { workspaceId: "w", userId: "h1" },
    { workspaceId: "w", userId: "h2" },
  ];
  const l = [{ workspaceId: "w", userId: "l1" }];
  const n = [
    { workspaceId: "w", userId: "n1" },
    { workspaceId: "w", userId: "n2" },
  ];

  const picked = selectPairsRoundRobin({ lists: [g, h, l, n], limit: 6 });

  assert.deepEqual(picked, [
    { workspaceId: "w", userId: "g1" },
    { workspaceId: "w", userId: "h1" },
    { workspaceId: "w", userId: "l1" },
    { workspaceId: "w", userId: "n1" },
    { workspaceId: "w", userId: "g2" },
    { workspaceId: "w", userId: "h2" },
  ]);
});

test("selectPairsRoundRobin avoids duplicate workspace/user pairs", () => {
  const a = [
    { workspaceId: "w1", userId: "u1" },
    { workspaceId: "w1", userId: "u2" },
  ];
  const b = [
    // Duplicate of a[0]
    { workspaceId: "w1", userId: "u1" },
    { workspaceId: "w2", userId: "u3" },
  ];

  const picked = selectPairsRoundRobin({ lists: [a, b], limit: 10 });

  assert.deepEqual(picked, [
    { workspaceId: "w1", userId: "u1" },
    { workspaceId: "w2", userId: "u3" },
    { workspaceId: "w1", userId: "u2" },
  ]);
});
