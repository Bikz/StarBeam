import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "@starbeam/db";

import { claimReferralForUser } from "../../src/lib/referrals";

function hasDatabaseUrl(): boolean {
  return (
    typeof process.env.DATABASE_URL === "string" &&
    process.env.DATABASE_URL.length > 0
  );
}

test(
  "claimReferralForUser applies referredByUserId exactly once under concurrency",
  { skip: !hasDatabaseUrl() },
  async () => {
    const t = Date.now();
    const codeA = `refA-${t}`;
    const codeB = `refB-${t}`;

    const [me, refA, refB] = await Promise.all([
      prisma.user.create({
        data: { email: `ref-me-${t}@starbeamhq.com` },
        select: { id: true },
      }),
      prisma.user.create({
        data: { email: `ref-a-${t}@starbeamhq.com`, referralCode: codeA },
        select: { id: true },
      }),
      prisma.user.create({
        data: { email: `ref-b-${t}@starbeamhq.com`, referralCode: codeB },
        select: { id: true },
      }),
    ]);

    try {
      const attempts = Array.from({ length: 20 }).map((_, idx) =>
        claimReferralForUser({
          userId: me.id,
          referralCode: idx % 2 === 0 ? codeA : codeB,
        }),
      );

      const results = await Promise.all(attempts);
      const appliedCount = results.filter((r) => r.applied).length;
      assert.equal(appliedCount, 1);

      const after = await prisma.user.findUnique({
        where: { id: me.id },
        select: { referredByUserId: true },
      });
      assert.ok(after?.referredByUserId);
      assert.ok([refA.id, refB.id].includes(after?.referredByUserId ?? ""));

      const secondAttempt = await claimReferralForUser({
        userId: me.id,
        referralCode: after?.referredByUserId === refA.id ? codeB : codeA,
      });
      assert.equal(secondAttempt.applied, false);

      const after2 = await prisma.user.findUnique({
        where: { id: me.id },
        select: { referredByUserId: true },
      });
      assert.equal(after2?.referredByUserId, after?.referredByUserId);
    } finally {
      await prisma.user.deleteMany({
        where: { id: { in: [me.id, refA.id, refB.id] } },
      });
    }
  },
);
