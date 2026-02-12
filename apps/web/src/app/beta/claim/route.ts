import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";

import { authOptions } from "@/lib/auth";
import { claimReferralForUser } from "@/lib/referrals";
import { sha256Hex } from "@/lib/apiTokens";
import { clientIpFromHeaders } from "@/lib/clientIp";
import { consumeRateLimit } from "@/lib/rateLimit";
import { safeRedirectPath } from "@/lib/safeRedirect";
import { webOrigin } from "@/lib/webOrigin";

export async function GET(request: Request) {
  const url = new URL(request.url);

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const loginUrl = new URL("/login", webOrigin());
    loginUrl.searchParams.set("callbackUrl", `${url.pathname}${url.search}`);

    const ref = (url.searchParams.get("ref") ?? "").trim();
    if (ref) loginUrl.searchParams.set("ref", ref);

    return NextResponse.redirect(loginUrl);
  }

  const safeNext = safeRedirectPath(url.searchParams.get("next"), "/beta");

  const cookieStore = await cookies();
  const cookieRef = cookieStore.get("sb_ref")?.value ?? "";
  const queryRef = url.searchParams.get("ref") ?? "";
  const referralCodeRaw = (cookieRef || queryRef).trim();
  const referralCode = referralCodeRaw.length <= 128 ? referralCodeRaw : "";

  const resp = NextResponse.redirect(new URL(safeNext, webOrigin()));
  const secure = process.env.NODE_ENV === "production";
  // Clear cookie regardless of validity (prevents loops).
  resp.cookies.set("sb_ref", "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    httpOnly: true,
    secure,
  });

  if (!referralCode) return resp;

  const ip = clientIpFromHeaders(request.headers) || "unknown";
  const ipHash = sha256Hex(ip);
  try {
    await Promise.all([
      consumeRateLimit({
        key: `ref_claim:user:${session.user.id}`,
        windowSec: 5 * 60,
        limit: Number(process.env.STARB_REF_CLAIM_USER_LIMIT_5M ?? "20"),
      }),
      consumeRateLimit({
        key: `ref_claim:ip:${ipHash}`,
        windowSec: 5 * 60,
        limit: Number(process.env.STARB_REF_CLAIM_IP_LIMIT_5M ?? "100"),
      }),
    ]);
  } catch {
    return resp;
  }

  // Best-effort: referral attribution should never block navigation.
  await claimReferralForUser({
    userId: session.user.id,
    referralCode,
  }).catch(() => undefined);

  return resp;
}
