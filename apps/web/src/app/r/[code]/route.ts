import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const url = new URL(request.url);

  const resp = NextResponse.redirect(new URL("/login", url.origin));
  resp.cookies.set("sb_ref", code, {
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
    sameSite: "lax",
  });
  return resp;
}

