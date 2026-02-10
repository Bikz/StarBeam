import { prisma } from "@starbeam/db";
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
  const title = clampString(obj.title, 240);
  const details = clampString(obj.body, 4000);

  if (!workspaceId) {
    return jsonError({
      error: "invalid_request",
      errorDescription: "Missing workspaceId",
    });
  }
  if (!title) {
    return jsonError({
      error: "invalid_request",
      errorDescription: "Missing title",
    });
  }

  const member = await hasWorkspaceMembership({ userId, workspaceId });
  if (!member) {
    return jsonError({ error: "forbidden" }, 403);
  }

  const task = await prisma.task.create({
    data: {
      workspaceId,
      userId,
      sourceItemId: null,
      title,
      body: details,
      status: "OPEN",
      dueAt: null,
      snoozedUntil: null,
    },
    select: {
      id: true,
      title: true,
      body: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    { task },
    { headers: { "Cache-Control": "no-store" } },
  );
}
