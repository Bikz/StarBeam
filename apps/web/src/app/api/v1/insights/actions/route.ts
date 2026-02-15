import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import { isActionStateServerEnabled } from "@/lib/flags";
import { consumeRateLimit } from "@/lib/rateLimit";

const ActionStateSchema = z.object({
  workspaceSlug: z.string().trim().min(1).max(128),
  editionDateIso: z.string().trim().min(1).max(64),
  cardId: z.string().trim().min(1).max(64),
  state: z.enum(["OPEN", "DONE", "DISMISSED"]),
  metadata: z.unknown().optional(),
});

function parseEditionDate(editionDateIso: string): Date | null {
  const parsed = new Date(editionDateIso);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
}

function toInputJson(value: unknown) {
  if (typeof value === "undefined") return undefined;
  return JSON.parse(JSON.stringify(value));
}

async function resolveMembership(args: {
  userId: string;
  workspaceSlug: string;
}) {
  return prisma.membership.findFirst({
    where: { userId: args.userId, workspace: { slug: args.workspaceSlug } },
    select: { workspaceId: true },
  });
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isActionStateServerEnabled()) {
    return NextResponse.json({ error: "feature_disabled" }, { status: 404 });
  }

  const url = new URL(request.url);
  const workspaceSlug = (url.searchParams.get("workspaceSlug") ?? "").trim();
  const editionDateIso = (url.searchParams.get("editionDateIso") ?? "").trim();
  if (!workspaceSlug || !editionDateIso) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }
  const editionDate = parseEditionDate(editionDateIso);
  if (!editionDate) {
    return NextResponse.json(
      { error: "invalid_edition_date" },
      { status: 400 },
    );
  }

  const membership = await resolveMembership({
    userId: session.user.id,
    workspaceSlug,
  });
  if (!membership) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rows = await prisma.insightActionState.findMany({
    where: {
      workspaceId: membership.workspaceId,
      userId: session.user.id,
      editionDate,
    },
    select: { cardId: true, state: true },
  });

  return NextResponse.json({
    ok: true,
    states: rows,
    doneCardIds: rows
      .filter((row) => row.state === "DONE")
      .map((row) => row.cardId),
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isActionStateServerEnabled()) {
    return NextResponse.json({ error: "feature_disabled" }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = ActionStateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  await consumeRateLimit({
    key: `insight-action-state:user:${session.user.id}`,
    windowSec: 60,
    limit: 120,
  });

  const membership = await resolveMembership({
    userId: session.user.id,
    workspaceSlug: parsed.data.workspaceSlug,
  });
  if (!membership) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const editionDate = parseEditionDate(parsed.data.editionDateIso);
  if (!editionDate) {
    return NextResponse.json(
      { error: "invalid_edition_date" },
      { status: 400 },
    );
  }

  await prisma.insightActionState.upsert({
    where: {
      workspaceId_userId_editionDate_cardId: {
        workspaceId: membership.workspaceId,
        userId: session.user.id,
        editionDate,
        cardId: parsed.data.cardId,
      },
    },
    update: {
      state: parsed.data.state,
      ...(typeof parsed.data.metadata === "undefined"
        ? {}
        : { metadata: toInputJson(parsed.data.metadata) }),
    },
    create: {
      workspaceId: membership.workspaceId,
      userId: session.user.id,
      editionDate,
      cardId: parsed.data.cardId,
      state: parsed.data.state,
      ...(typeof parsed.data.metadata === "undefined"
        ? {}
        : { metadata: toInputJson(parsed.data.metadata) }),
    },
  });

  return NextResponse.json({ ok: true });
}
