import assert from "node:assert/strict";
import test from "node:test";

import { ensureBetaEligibilityProcessedWithDeps } from "../src/lib/betaEligibility";

test("returns null when session user no longer exists", async () => {
  const status = await ensureBetaEligibilityProcessedWithDeps(
    {
      findUser: async () => null,
      countReferrals: async () => 0,
      ensureReferralCode: async () => {
        throw new Error("should not be called");
      },
      grantBetaAccess: async () => {
        throw new Error("should not be called");
      },
    },
    "missing-user",
  );

  assert.equal(status, null);
});

test("returns null when referral mint races with deleted user", async () => {
  const status = await ensureBetaEligibilityProcessedWithDeps(
    {
      findUser: async () => ({
        id: "u_1",
        email: "person@example.com",
        betaAccessGrantedAt: null,
        referralCode: null,
      }),
      countReferrals: async () => 0,
      ensureReferralCode: async () => {
        throw new Error("User not found");
      },
      grantBetaAccess: async () => {
        throw new Error("should not be called");
      },
    },
    "u_1",
  );

  assert.equal(status, null);
});

test("throws non-recoverable errors from referral code minting", async () => {
  await assert.rejects(
    ensureBetaEligibilityProcessedWithDeps(
      {
        findUser: async () => ({
          id: "u_2",
          email: "person@example.com",
          betaAccessGrantedAt: null,
          referralCode: null,
        }),
        countReferrals: async () => 0,
        ensureReferralCode: async () => {
          throw new Error("db timeout");
        },
        grantBetaAccess: async () => undefined,
      },
      "u_2",
    ),
    /db timeout/,
  );
});
