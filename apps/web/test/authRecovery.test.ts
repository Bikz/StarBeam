import assert from "node:assert/strict";
import test from "node:test";

import {
  SESSION_RECOVERED_ERROR,
  buildSignOutUrl,
  isSessionRecoveredError,
  loginErrorMessage,
  staleSessionLoginUrl,
  staleSessionSignOutUrl,
} from "../src/lib/authRecovery";

test("staleSessionSignOutUrl encodes callback URL with session_recovered error", () => {
  const expected = buildSignOutUrl(staleSessionLoginUrl());
  assert.equal(staleSessionSignOutUrl(), expected);
  assert.ok(staleSessionSignOutUrl().includes(SESSION_RECOVERED_ERROR));
});

test("loginErrorMessage returns explicit recovery copy for stale sessions", () => {
  assert.equal(isSessionRecoveredError("session_recovered"), true);
  assert.equal(
    loginErrorMessage("session_recovered"),
    "Your session expired and was reset. Please sign in again.",
  );
});

test("loginErrorMessage preserves known credential copy and generic fallback", () => {
  assert.equal(
    loginErrorMessage("CredentialsSignin"),
    "That code didn’t work. Please try again.",
  );
  assert.equal(
    loginErrorMessage("unknown_code"),
    "Could not sign in. Please try again.",
  );
});
