import { NextResponse, type NextRequest } from "next/server";

function canonicalOrigin(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_WEB_ORIGIN ||
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    "";
  const v = raw.trim().replace(/\/+$/, "");
  if (!v) return null;
  try {
    return new URL(v).origin;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  // Keep health checks stable and non-redirecting.
  const { pathname } = request.nextUrl;
  if (pathname === "/api/health") return NextResponse.next();

  const origin = canonicalOrigin();
  if (!origin) return NextResponse.next();

  // If the request comes in on a non-canonical host (e.g. *.onrender.com),
  // redirect to the canonical origin so auth cookies live on one domain.
  const currentOrigin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  if (currentOrigin === origin) return NextResponse.next();

  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, origin);
  return NextResponse.redirect(target, 308);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};

