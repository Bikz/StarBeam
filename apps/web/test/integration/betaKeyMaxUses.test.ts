import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "@starbeam/db";

import { hashBetaKey } from "../../src/lib/betaKeys";
import { redeemBetaKeyForUser } from "../../src/lib/betaKeyRedemption";

function hasDatabaseUrl(): boolean {
  return (
    typeof process.env.DATABASE_URL === "string" &&
    process.env.DATABASE_URL.length > 0
  );
}

test(
  "redeemBetaKeyForUser enforces maxUses under concurrency",
  { skip: !hasDatabaseUrl() },
  async () => {
    const now = new Date();
    const t = Date.now();
    const code = `beta-integration-${t}-${Math.random().toString(16).slice(2)}`;
    const codeHash = hashBetaKey(code);

    const key = await prisma.betaKey.create({
      data: { codeHash, label: "integration", maxUses: 1, expiresAt: null },
      select: { id: true },
    });

    const users = await Promise.all(
      Array.from({ length: 12 }).map((_, idx) =>
        prisma.user.create({
          data: {
            email: `beta-integration-${t}-${idx}@starbeamhq.com`,
            emailVerified: now,
          },
          select: { id: true },
        }),
      ),
    );

    try {
      const results = await Promise.all(
        users.map((u) => redeemBetaKeyForUser({ code, userId: u.id, now })),
      );

      const okCount = results.filter((r) => r.ok).length;
      assert.equal(okCount, 1);

      const redemptionCount = await prisma.betaKeyRedemption.count({
        where: { betaKeyId: key.id },
      });
      assert.equal(redemptionCount, 1);
    } finally {
      await prisma.betaKey
        .delete({ where: { id: key.id } })
        .catch(() => undefined);
      await prisma.user
        .deleteMany({ where: { id: { in: users.map((u) => u.id) } } })
        .catch(() => undefined);
    }
  },
);
