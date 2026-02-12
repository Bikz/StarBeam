import { isAdminEmail } from "@/lib/admin";

export type BetaEligibilityStatus = {
  hasAccess: boolean;
  referralCode: string;
  referralCount: number;
};

type BetaEligibilityUser = {
  id: string;
  email: string | null;
  betaAccessGrantedAt: Date | null;
  referralCode: string | null;
};

type BetaEligibilityDeps = {
  findUser: (userId: string) => Promise<BetaEligibilityUser | null>;
  countReferrals: (userId: string) => Promise<number>;
  ensureReferralCode: (userId: string) => Promise<string>;
  grantBetaAccess: (userId: string) => Promise<void>;
};

function isMissingUserError(error: unknown): boolean {
  return error instanceof Error && error.message === "User not found";
}

export async function ensureBetaEligibilityProcessedWithDeps(
  deps: BetaEligibilityDeps,
  userId: string,
): Promise<BetaEligibilityStatus | null> {
  const [user, referralCount] = await Promise.all([
    deps.findUser(userId),
    deps.countReferrals(userId),
  ]);
  if (!user) return null;

  let referralCode = user.referralCode;
  if (!referralCode) {
    try {
      referralCode = await deps.ensureReferralCode(userId);
    } catch (error) {
      if (isMissingUserError(error)) return null;
      throw error;
    }
  }

  // Admin allowlist bypasses the beta gate (useful for internal testing / ops).
  if (isAdminEmail(user.email)) {
    if (!user.betaAccessGrantedAt) {
      await deps.grantBetaAccess(userId);
    }
    return { hasAccess: true, referralCode, referralCount };
  }

  if (user.betaAccessGrantedAt) {
    return { hasAccess: true, referralCode, referralCount };
  }

  if (referralCount >= 5) {
    await deps.grantBetaAccess(userId);
    return { hasAccess: true, referralCode, referralCount };
  }

  return { hasAccess: false, referralCode, referralCount };
}
