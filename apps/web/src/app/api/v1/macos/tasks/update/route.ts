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

function parseISODate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
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
  const taskId = clampString(obj.taskId, 128);
  const status = clampString(obj.status, 16).toUpperCase();

  if (!workspaceId) {
    return jsonError({
      error: "invalid_request",
      errorDescription: "Missing workspaceId",
    });
  }
  if (!taskId) {
    return jsonError({
      error: "invalid_request",
      errorDescription: "Missing taskId",
    });
  }
  if (!status) {
    return jsonError({
      error: "invalid_request",
      errorDescription: "Missing status",
    });
  }
  if (status !== "OPEN" && status !== "DONE" && status !== "SNOOZED") {
    return jsonError({
      error: "invalid_request",
      errorDescription: "Invalid status",
    });
  }

  const member = await hasWorkspaceMembership({ userId, workspaceId });
  if (!member) {
    return jsonError({ error: "forbidden" }, 403);
  }

  const snoozedUntil =
    status === "SNOOZED" ? parseISODate(obj.snoozedUntil) : null;
  if (status === "SNOOZED" && !snoozedUntil) {
    return jsonError({
      error: "invalid_request",
      errorDescription: "Missing snoozedUntil",
    });
  }

  const updated = await prisma.task.updateMany({
    where: { id: taskId, workspaceId, userId },
    data: {
      status: status as "OPEN" | "DONE" | "SNOOZED",
      snoozedUntil: status === "SNOOZED" ? snoozedUntil : null,
    },
  });

  if (!updated.count) {
    return jsonError({ error: "not_found" }, 404);
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId, userId },
    select: {
      id: true,
      title: true,
      body: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      snoozedUntil: true,
    },
  });

  return NextResponse.json(
    { task },
    { headers: { "Cache-Control": "no-store" } },
  );
}
