import { NextResponse } from "next/server";

import { webOrigin } from "@/lib/webOrigin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  // Note: in production behind proxies, `request.url` can reflect an internal
  // origin (e.g. localhost:PORT). Always redirect to the configured public origin.
  const resp = NextResponse.redirect(new URL("/login", webOrigin()));
  resp.cookies.set("sb_ref", code, {
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
    sameSite: "lax",
  });
  return resp;
}
