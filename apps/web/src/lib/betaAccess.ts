import { redirect } from "next/navigation";

import { prisma } from "@starbeam/db";

import { staleSessionSignOutUrl } from "@/lib/authRecovery";
import {
  ensureBetaEligibilityProcessedWithDeps,
  type BetaEligibilityStatus,
} from "@/lib/betaEligibility";
import { ensureReferralCodeForUser } from "@/lib/userProvisioning";

async function referralCountForUser(userId: string): Promise<number> {
  return prisma.user.count({
    where: {
      referredByUserId: userId,
      // Count "real" signups (a user row exists). Email is optional in schema but should exist.
    },
  });
}

export async function ensureBetaEligibilityProcessed(
  userId: string,
): Promise<BetaEligibilityStatus | null> {
  return ensureBetaEligibilityProcessedWithDeps(
    {
      findUser: (id) =>
        prisma.user.findUnique({
          where: { id },
          select: {
            id: true,
            email: true,
            betaAccessGrantedAt: true,
            referralCode: true,
          },
        }),
      countReferrals: referralCountForUser,
      ensureReferralCode: (id) =>
        prisma.$transaction((tx) => ensureReferralCodeForUser(tx, id)),
      grantBetaAccess: async (id) => {
        await prisma.user.update({
          where: { id },
          data: { betaAccessGrantedAt: new Date() },
        });
      },
    },
    userId,
  );
}

export async function requireBetaAccessOrRedirect(
  userId: string,
): Promise<void> {
  const status = await ensureBetaEligibilityProcessed(userId);
  if (!status) {
    redirect(staleSessionSignOutUrl());
  }
  if (!status.hasAccess) redirect("/beta");
}
