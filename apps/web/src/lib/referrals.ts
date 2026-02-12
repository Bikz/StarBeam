import { prisma } from "@starbeam/db";

export async function claimReferralForUser(args: {
  userId: string;
  referralCode: string;
}): Promise<{ applied: boolean }> {
  const referralCodeRaw = args.referralCode.trim();
  const referralCode = referralCodeRaw.length <= 128 ? referralCodeRaw : "";
  if (!referralCode) return { applied: false };

  const [me, referrer] = await Promise.all([
    prisma.user.findUnique({
      where: { id: args.userId },
      select: { id: true, referredByUserId: true },
    }),
    prisma.user.findFirst({
      where: { referralCode },
      select: { id: true },
    }),
  ]);

  if (!me) return { applied: false };
  if (me.referredByUserId) return { applied: false };
  if (!referrer) return { applied: false };
  if (referrer.id === me.id) return { applied: false };

  const updated = await prisma.user.updateMany({
    where: { id: me.id, referredByUserId: null },
    data: { referredByUserId: referrer.id },
  });

  return { applied: updated.count === 1 };
}
