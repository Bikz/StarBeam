import { NextResponse, type NextRequest } from "next/server";

function isAsciiToken(value: string): boolean {
  // Request IDs should be printable ASCII and free of whitespace/control chars.
  // This keeps logs/headers robust and avoids weird proxy/header injection edge cases.
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x21 || code > 0x7e) return false;
  }
  return true;
}

function ensureRequestId(request: NextRequest): string {
  const existing = (request.headers.get("x-request-id") ?? "").trim();
  if (existing && existing.length <= 128 && isAsciiToken(existing))
    return existing;

  // Prefer UUIDs so they are human-readable and stable across environments.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  // Fallback: very unlikely to collide; keep it short to avoid oversized headers.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

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
  const requestId = ensureRequestId(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const next = () => {
    const resp = NextResponse.next({ request: { headers: requestHeaders } });
    resp.headers.set("x-request-id", requestId);
    return resp;
  };

  // Keep health checks stable and non-redirecting.
  const { pathname } = request.nextUrl;
  if (pathname === "/api/health") return next();

  const origin = canonicalOrigin();
  if (!origin) return next();

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
  if (!canonicalHost) return next();

  const reqHost =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ||
    firstHeaderValue(request.headers.get("host")) ||
    request.nextUrl.host;

  if (reqHost === canonicalHost) return next();

  const target = new URL(
    request.nextUrl.pathname + request.nextUrl.search,
    origin,
  );
  const resp = NextResponse.redirect(target, 308);
  resp.headers.set("x-request-id", requestId);
  return resp;
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
