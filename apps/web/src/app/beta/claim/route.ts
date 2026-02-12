import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";

import { authOptions } from "@/lib/auth";
import { claimReferralForUser } from "@/lib/referrals";
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

  const next = url.searchParams.get("next") ?? "/beta";
  const safeNext = next.startsWith("/") ? next : "/beta";

  const cookieStore = await cookies();
  const cookieRef = cookieStore.get("sb_ref")?.value ?? "";
  const queryRef = url.searchParams.get("ref") ?? "";
  const referralCodeRaw = (cookieRef || queryRef).trim();
  const referralCode = referralCodeRaw.length <= 128 ? referralCodeRaw : "";

  const resp = NextResponse.redirect(new URL(safeNext, webOrigin()));
  // Clear cookie regardless of validity (prevents loops).
  resp.cookies.set("sb_ref", "", { path: "/", maxAge: 0 });

  if (!referralCode) return resp;

  // Best-effort: referral attribution should never block navigation.
  await claimReferralForUser({
    userId: session.user.id,
    referralCode,
  }).catch(() => undefined);

  return resp;
}
