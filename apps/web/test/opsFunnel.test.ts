import assert from "node:assert/strict";
import test from "node:test";

import { computeFunnelFromEvents } from "../src/lib/opsFunnel";

const t0 = new Date("2026-02-01T00:00:00.000Z");

function at(hoursFromStart: number): Date {
  return new Date(t0.getTime() + hoursFromStart * 60 * 60 * 1000);
}

test("computeFunnelFromEvents calculates activation and week-1 retention", () => {
  const result = computeFunnelFromEvents([
    { eventType: "SIGNED_IN", userId: "u1", workspaceId: null, createdAt: at(0) },
    { eventType: "GOOGLE_CONNECTED", userId: "u1", workspaceId: "w1", createdAt: at(1) },
    { eventType: "FIRST_PULSE_QUEUED", userId: "u1", workspaceId: "w1", createdAt: at(2) },
    { eventType: "FIRST_PULSE_READY", userId: "u1", workspaceId: "w1", createdAt: at(3) },
    { eventType: "PULSE_VIEWED_WEB", userId: "u1", workspaceId: "w1", createdAt: at(6) },
    { eventType: "PULSE_VIEWED_WEB", userId: "u1", workspaceId: "w1", createdAt: at(30) },
    { eventType: "PULSE_VIEWED_WEB", userId: "u1", workspaceId: "w1", createdAt: at(60) },
    { eventType: "OVERVIEW_SYNCED_MACOS", userId: "u1", workspaceId: "w1", createdAt: at(24) },

    { eventType: "SIGNED_IN", userId: "u2", workspaceId: null, createdAt: at(0) },
    { eventType: "GOOGLE_CONNECTED", userId: "u2", workspaceId: "w2", createdAt: at(1) },

    { eventType: "SIGNED_IN", userId: "u3", workspaceId: null, createdAt: at(0) },
    { eventType: "FIRST_PULSE_READY", userId: "u3", workspaceId: "w3", createdAt: at(24 * 9) },

    { eventType: "FIRST_PULSE_READY", userId: "u4", workspaceId: "w4", createdAt: at(2) },
  ]);

  assert.deepEqual(result.activation, {
    signedIn: 3,
    googleConnected: 2,
    firstPulseQueued: 1,
    firstPulseReady: 3,
    readyWithin24h: 1,
    readyWithin7d: 1,
  });

  assert.deepEqual(result.retention, {
    pulseViewedWeek1_1plus: 1,
    pulseViewedWeek1_3plus: 1,
    overviewSyncedWeek1_1plus: 1,
  });
});
