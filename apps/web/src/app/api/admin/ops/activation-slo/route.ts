import { timingSafeEqual } from "node:crypto";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { authOptions } from "@/lib/auth";
import { isActivationSloEnabled } from "@/lib/flags";
import { getOpsFunnelSummary, parseWindowDays } from "@/lib/opsFunnel";

function noStoreJson(body: unknown, init?: ResponseInit): NextResponse {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(body, { ...init, headers });
}

function parseBearerToken(value: string | null): string | null {
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  const token = match?.[1]?.trim() ?? "";
  return token || null;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

async function hasOpsAccess(request: Request): Promise<boolean> {
  const staticToken = (process.env.STARB_OPS_METRICS_TOKEN ?? "").trim();
  if (staticToken) {
    const incoming = parseBearerToken(request.headers.get("authorization"));
    if (incoming && safeEqual(incoming, staticToken)) return true;
  }

  const session = await getServerSession(authOptions);
  return Boolean(session?.user?.email && isAdminEmail(session.user.email));
}

export async function GET(request: Request) {
  const allowed = await hasOpsAccess(request);
  if (!allowed) {
    return noStoreJson({ error: "unauthorized" }, { status: 401 });
  }
  if (!isActivationSloEnabled()) {
    return noStoreJson({ error: "feature_disabled" }, { status: 404 });
  }

  const url = new URL(request.url);
  const windowDays = parseWindowDays(url.searchParams.get("windowDays"));
  const summary = await getOpsFunnelSummary({ windowDays });

  return noStoreJson({
    ok: true,
    generatedAt: summary.generatedAt,
    windowDays: summary.windowDays,
    chainCoveragePct: summary.chainCoveragePct,
    connectedNoPulse24h: summary.activationBacklog.connectedNoPulse24h,
    failedBlocking24h: summary.activationBacklog.failedBlocking24h,
    failedRetriable24h: summary.activationBacklog.failedRetriable24h,
    queuedOrRunningStale24h: summary.activationBacklog.queuedOrRunningStale24h,
    topFailureReasons: summary.activationBacklog.topFailureReasons,
  });
}
