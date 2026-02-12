import { NextResponse } from "next/server";

import { webOrigin } from "@/lib/webOrigin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const referralCodeRaw = String(code ?? "").trim();
  const referralCode = referralCodeRaw.length <= 128 ? referralCodeRaw : "";

  const loginUrl = new URL("/login", webOrigin());
  if (referralCode) {
    loginUrl.searchParams.set("ref", referralCode);
  }
  // Note: in production behind proxies, `request.url` can reflect an internal
  // origin (e.g. localhost:PORT). Always redirect to the configured public origin.
  const resp = NextResponse.redirect(loginUrl);
  if (referralCode) {
    const secure = process.env.NODE_ENV === "production";
    resp.cookies.set("sb_ref", referralCode, {
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
      sameSite: "lax",
      httpOnly: true,
      secure,
    });
  }
  return resp;
}
