import assert from "node:assert/strict";
import test from "node:test";

import {
  mintAccessToken,
  mintRefreshToken,
  parseAccessToken,
} from "../src/lib/apiTokens";

test("apiTokens: mintAccessToken round-trip", () => {
  const original = process.env.AUTH_SECRET;
  try {
    process.env.AUTH_SECRET = "test_secret";
    const { token } = mintAccessToken({ userId: "user_123", ttlSeconds: 60 });
    const parsed = parseAccessToken(token);
    assert.equal(parsed.sub, "user_123");
  } finally {
    if (original === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = original;
  }
});

test("apiTokens: mintRefreshToken produces a hash", () => {
  const { refreshToken, tokenHash } = mintRefreshToken();
  assert.ok(refreshToken.length > 10);
  assert.match(tokenHash, /^[a-f0-9]{64}$/);
});
