import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import { isInsightFeedbackEnabled } from "@/lib/flags";
import {
  insightInteractionTypes,
  normalizeInsightReasonCode,
} from "@/lib/insightInteractions";
import { consumeRateLimit } from "@/lib/rateLimit";

const InteractionSchema = z.object({
  workspaceSlug: z.string().trim().min(1).max(128),
  editionDateIso: z.string().trim().min(1).max(64),
  cardId: z.string().trim().min(1).max(64),
  interactionType: z.enum(insightInteractionTypes),
  actionState: z.enum(["OPEN", "DONE", "DISMISSED"]).optional(),
  platform: z.enum(["web", "macos"]).optional(),
  reasonCode: z.string().trim().min(1).max(120).nullable().optional(),
  metadata: z.unknown().optional(),
});

function toInputJson(value: unknown) {
  if (typeof value === "undefined") return undefined;
  return JSON.parse(JSON.stringify(value));
}

function parseEditionDate(editionDateIso: string): Date | null {
  const parsed = new Date(editionDateIso);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isInsightFeedbackEnabled()) {
    return NextResponse.json({ error: "feature_disabled" }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = InteractionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  await consumeRateLimit({
    key: `insight-interaction:user:${session.user.id}`,
    windowSec: 60,
    limit: 120,
  });

  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      workspace: { slug: parsed.data.workspaceSlug },
    },
    select: { workspaceId: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const editionDate = parseEditionDate(parsed.data.editionDateIso);
  const reasonCode = normalizeInsightReasonCode(parsed.data.reasonCode);

  await prisma.insightInteraction.create({
    data: {
      workspaceId: membership.workspaceId,
      userId: session.user.id,
      ...(editionDate ? { editionDate } : {}),
      cardId: parsed.data.cardId,
      interactionType: parsed.data.interactionType,
      reasonCode,
      metadata: toInputJson({
        ...(typeof parsed.data.metadata === "undefined"
          ? {}
          : { metadata: parsed.data.metadata }),
        ...(parsed.data.actionState
          ? { actionState: parsed.data.actionState }
          : {}),
        platform: parsed.data.platform ?? "web",
      }),
    },
  });

  return NextResponse.json({ ok: true });
}
