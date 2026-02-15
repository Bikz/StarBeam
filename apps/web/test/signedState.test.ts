import assert from "node:assert/strict";
import test from "node:test";

import { mintSignedState, parseSignedState } from "../src/lib/signedState";

test("signedState preserves a safe onboarding next path", () => {
  process.env.AUTH_SECRET = "test-secret";

  const token = mintSignedState({
    userId: "usr_1",
    workspaceId: "ws_1",
    workspaceSlug: "personal-abc",
    nonce: "nonce",
    next: "/w/personal-abc/onboarding/integrations",
  });

  const parsed = parseSignedState(token);
  assert.equal(parsed.next, "/w/personal-abc/onboarding/integrations");
});

test("signedState drops unsafe next paths", () => {
  process.env.AUTH_SECRET = "test-secret";

  const token = mintSignedState({
    userId: "usr_1",
    workspaceId: "ws_1",
    workspaceSlug: "personal-abc",
    nonce: "nonce",
    next: "https://evil.example.com/phish",
  });

  const parsed = parseSignedState(token);
  assert.equal("next" in parsed, false);
});
