import assert from "node:assert/strict";
import test from "node:test";

import { isGoogleAuthRevoked } from "../src/lib/google/sync";
import { HttpError } from "../src/lib/integrations/http";

test("isGoogleAuthRevoked treats 401 as revoked", () => {
  const err = new HttpError("unauthorized", 401, "invalid_token");
  assert.equal(isGoogleAuthRevoked(err), true);
});

test("isGoogleAuthRevoked treats invalid_grant 400 as revoked", () => {
  const err = new HttpError(
    "bad request",
    400,
    JSON.stringify({ error: "invalid_grant" }),
  );
  assert.equal(isGoogleAuthRevoked(err), true);
});

test("isGoogleAuthRevoked does not mark unrelated 400 as revoked", () => {
  const err = new HttpError("bad request", 400, "missing required field");
  assert.equal(isGoogleAuthRevoked(err), false);
});

test("isGoogleAuthRevoked detects refresh-token-missing message", () => {
  const err = new Error("Google refresh token missing; reconnect required");
  assert.equal(isGoogleAuthRevoked(err), true);
});

test("isGoogleAuthRevoked keeps transient 5xx as retryable", () => {
  const err = new HttpError("server error", 503, "upstream timeout");
  assert.equal(isGoogleAuthRevoked(err), false);
});
