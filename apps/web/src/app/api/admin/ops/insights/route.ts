import { timingSafeEqual } from "node:crypto";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isAdminEmail } from "@/lib/admin";
import { authOptions } from "@/lib/auth";
import { isOpsManualSkillControlEnabled } from "@/lib/flags";
import {
  parseDisabledSkillRefsInput,
  saveInsightManualControls,
} from "@/lib/insightManualControls";
import { getOpsInsightsSummary, parseWindowDays } from "@/lib/opsFunnel";

const UpdateManualControlsSchema = z.object({
  discoveredSkillExecutionEnabled: z.boolean(),
  disabledSkillRefs: z
    .array(z.string().trim().min(1).max(200))
    .max(100)
    .optional(),
});

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

  const url = new URL(request.url);
  const windowDays = parseWindowDays(url.searchParams.get("windowDays"));
  const summary = await getOpsInsightsSummary({ windowDays });

  return noStoreJson({
    ok: true,
    generatedAt: summary.generatedAt,
    windowDays: summary.windowDays,
    quality: summary.quality,
    byPersona: summary.byPersona,
    bySkill: summary.bySkill,
    bySubmode: summary.bySubmode,
    discoveredSkillRunner: summary.discoveredSkillRunner,
    manualControls: summary.manualControls,
    runner: summary.runner,
  });
}

export async function POST(request: Request) {
  const allowed = await hasOpsAccess(request);
  if (!allowed) {
    return noStoreJson({ error: "unauthorized" }, { status: 401 });
  }
  if (!isOpsManualSkillControlEnabled()) {
    return noStoreJson({ error: "feature_disabled" }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return noStoreJson({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = UpdateManualControlsSchema.safeParse(payload);
  if (!parsed.success) {
    return noStoreJson({ error: "invalid_payload" }, { status: 400 });
  }

  const disabledSkillRefs = parseDisabledSkillRefsInput(
    (parsed.data.disabledSkillRefs ?? []).join(","),
  );
  await saveInsightManualControls({
    discoveredSkillExecutionEnabled:
      parsed.data.discoveredSkillExecutionEnabled,
    disabledSkillRefs,
  });

  return noStoreJson({
    ok: true,
    manualControls: {
      discoveredSkillExecutionEnabled:
        parsed.data.discoveredSkillExecutionEnabled,
      disabledSkillRefs,
    },
  });
}
