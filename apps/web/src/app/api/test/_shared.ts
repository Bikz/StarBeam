import { NextResponse } from "next/server";

function isTruthy(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes((value ?? "").trim().toLowerCase());
}

function clientIp(headers: Headers): string {
  const xf = headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() ?? "";
  return headers.get("cf-connecting-ip") ?? "";
}

function isLoopback(ip: string): boolean {
  const v = ip.trim();
  if (!v) return false;
  if (v === "127.0.0.1" || v === "::1") return true;
  // Best-effort: treat 127.0.0.0/8 as loopback.
  if (v.startsWith("127.")) return true;
  return false;
}

function isLocalHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h) return false;
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return true;
  // Common local setup for app subdomain routing.
  if (h.endsWith(".localhost")) return true;
  return false;
}

export function requireTestEndpoints(request: Request): NextResponse | null {
  // Never allow these endpoints in production.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({}, { status: 404 });
  }

  if (!isTruthy(process.env.STARB_TEST_ENDPOINTS)) {
    return NextResponse.json({}, { status: 404 });
  }

  // Optional: lock to loopback by default.
  const allowNonLocal = isTruthy(process.env.STARB_TEST_ALLOW_NONLOCAL);
  if (!allowNonLocal) {
    // Prefer hostname checks since CI/local dev typically don't set proxy IP headers.
    const url = new URL(request.url);
    if (!isLocalHostname(url.hostname)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const ip = clientIp(request.headers);
    if (ip && !isLoopback(ip)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  return null;
}
