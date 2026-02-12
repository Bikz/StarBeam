"use server";

import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { sha256Hex } from "@/lib/apiTokens";
import { redeemBetaKeyForUser } from "@/lib/betaKeyRedemption";
import { clientIpFromHeaders } from "@/lib/clientIp";
import { consumeRateLimit, RateLimitError } from "@/lib/rateLimit";

const RedeemSchema = z.object({
  code: z.string().min(8),
});

export async function redeemBetaKey(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const headerStore = await headers();
  const ip = clientIpFromHeaders(headerStore) || "unknown";
  const ipHash = sha256Hex(ip);
  try {
    await Promise.all([
      consumeRateLimit({
        key: `beta_redeem:user:${session.user.id}`,
        windowSec: 5 * 60,
        limit: Number(process.env.STARB_BETA_REDEEM_USER_LIMIT_5M ?? "10"),
      }),
      consumeRateLimit({
        key: `beta_redeem:ip:${ipHash}`,
        windowSec: 5 * 60,
        limit: Number(process.env.STARB_BETA_REDEEM_IP_LIMIT_5M ?? "50"),
      }),
    ]);
  } catch (err) {
    if (err instanceof RateLimitError) {
      redirect("/beta?error=rate_limited");
    }
    throw err;
  }

  const parsed = RedeemSchema.safeParse({
    code: String(formData.get("code") ?? ""),
  });
  if (!parsed.success) {
    redirect("/beta?error=invalid_key");
  }

  const result = await redeemBetaKeyForUser({
    code: parsed.data.code,
    userId: session.user.id,
  });

  if (!result.ok) {
    redirect(`/beta?error=${encodeURIComponent(result.error)}`);
  }

  redirect(`/w/personal-${session.user.id}`);
}
