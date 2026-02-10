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

function firstHeaderValue(raw: string | null): string {
  // Headers like x-forwarded-host can be a comma-separated list. We only care
  // about the client-facing entry.
  return (raw ?? "").split(",")[0]?.trim() ?? "";
}

export function middleware(request: NextRequest) {
  // Keep health checks stable and non-redirecting.
  const { pathname } = request.nextUrl;
  if (pathname === "/api/health") return NextResponse.next();

  const origin = canonicalOrigin();
  if (!origin) return NextResponse.next();

  // Cloudflare (and other proxies) may connect to Render over HTTP even when the
  // user is on HTTPS. Relying on request.nextUrl.protocol can cause an infinite
  // "https -> https" redirect loop. Canonicalize by host only.
  const canonicalHost = (() => {
    try {
      return new URL(origin).host;
    } catch {
      return "";
    }
  })();
  if (!canonicalHost) return NextResponse.next();

  const reqHost =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ||
    firstHeaderValue(request.headers.get("host")) ||
    request.nextUrl.host;

  if (reqHost === canonicalHost) return NextResponse.next();

  const target = new URL(
    request.nextUrl.pathname + request.nextUrl.search,
    origin,
  );
  return NextResponse.redirect(target, 308);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
