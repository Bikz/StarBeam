import { Prisma, prisma } from "@starbeam/db";
import { NextResponse } from "next/server";

import {
  getUserIdFromMacOSAuth,
  hasWorkspaceMembership,
  requireBetaAccess,
} from "@/lib/macosAuth";

type ErrorPayload = { error: string; errorDescription?: string };

function jsonError(payload: ErrorPayload, status = 400) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function clampString(value: unknown, maxLen: number): string {
  const s = typeof value === "string" ? value : "";
  return s.trim().slice(0, maxLen);
}

function parseISODate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toInputJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (typeof value === "undefined") return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  const userId = await getUserIdFromMacOSAuth(request);
  if (!userId) {
    return jsonError(
      {
        error: "invalid_token",
        errorDescription: "Missing or invalid auth token",
      },
      401,
    );
  }

  const betaOK = await requireBetaAccess(userId);
  if (!betaOK) {
    return jsonError(
      {
        error: "access_denied",
        errorDescription: "Private beta access required",
      },
      403,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError({
      error: "invalid_request",
      errorDescription: "Invalid JSON",
    });
  }

  const obj =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const workspaceId = clampString(obj.workspaceId, 128);
  const cardId = clampString(obj.cardId, 128);
  const state = clampString(obj.state, 16).toUpperCase();
  const editionDate = parseISODate(obj.editionDateIso);
  const metadata = toInputJson(obj.metadata);

  if (!workspaceId) {
    return jsonError({
      error: "invalid_request",
      errorDescription: "Missing workspaceId",
    });
  }
  if (!cardId) {
    return jsonError({
      error: "invalid_request",
      errorDescription: "Missing cardId",
    });
  }
  if (!editionDate) {
    return jsonError({
      error: "invalid_request",
      errorDescription: "Missing or invalid editionDateIso",
    });
  }
  if (state !== "OPEN" && state !== "DONE" && state !== "DISMISSED") {
    return jsonError({
      error: "invalid_request",
      errorDescription: "Invalid state",
    });
  }

  const member = await hasWorkspaceMembership({ userId, workspaceId });
  if (!member) {
    return jsonError({ error: "forbidden" }, 403);
  }

  await prisma.insightActionState.upsert({
    where: {
      workspaceId_userId_editionDate_cardId: {
        workspaceId,
        userId,
        editionDate,
        cardId,
      },
    },
    update: {
      state,
      ...(typeof metadata === "undefined" ? {} : { metadata }),
    },
    create: {
      workspaceId,
      userId,
      editionDate,
      cardId,
      state,
      ...(typeof metadata === "undefined" ? {} : { metadata }),
    },
  });

  if (state === "DONE") {
    await prisma.insightInteraction.create({
      data: {
        workspaceId,
        userId,
        editionDate,
        cardId,
        interactionType: "MARKED_DONE",
        metadata: {
          platform: "macos",
          actionState: "DONE",
        },
      },
    });
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
