import { redirect } from "next/navigation";

import { prisma } from "@starbeam/db";

import { ensureReferralCodeForUser } from "@/lib/userProvisioning";

export async function referralCountForUser(userId: string): Promise<number> {
  return prisma.user.count({
    where: {
      referredByUserId: userId,
      // Count "real" signups (a user row exists). Email is optional in schema but should exist.
    },
  });
}

export async function ensureBetaEligibilityProcessed(userId: string): Promise<{
  hasAccess: boolean;
  referralCode: string;
  referralCount: number;
}> {
  const [user, referralCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, betaAccessGrantedAt: true, referralCode: true },
    }),
    referralCountForUser(userId),
  ]);

  if (!user) throw new Error("User not found");

  const referralCode =
    user.referralCode ??
    (await prisma.$transaction((tx) => ensureReferralCodeForUser(tx, userId)));

  if (user.betaAccessGrantedAt) {
    return { hasAccess: true, referralCode, referralCount };
  }

  if (referralCount >= 5) {
    await prisma.user.update({
      where: { id: userId },
      data: { betaAccessGrantedAt: new Date() },
    });
    return { hasAccess: true, referralCode, referralCount };
  }

  return { hasAccess: false, referralCode, referralCount };
}

export async function requireBetaAccessOrRedirect(userId: string): Promise<void> {
  const status = await ensureBetaEligibilityProcessed(userId);
  if (!status.hasAccess) redirect("/beta");
}

