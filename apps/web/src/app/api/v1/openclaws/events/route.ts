import { Prisma, prisma } from "@starbeam/db";
import { NextResponse } from "next/server";

import {
  getUserIdFromMacOSAuth,
  hasWorkspaceMembership,
  requireBetaAccess,
} from "@/lib/macosAuth";
import { consumeRateLimit, RateLimitError } from "@/lib/rateLimit";

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

function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function toInputJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (typeof value === "undefined") return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

type IncomingEvent = {
  kind: string;
  commandId?: string;
  leaseId?: string;
  tsMs?: number;
  data?: unknown;
};

type KnownKind =
  | "HEARTBEAT"
  | "COMMAND_ACK"
  | "COMMAND_RESULT"
  | "TASK_STATE"
  | "LOG";

function normalizeKind(raw: string): string {
  return raw.trim().toUpperCase();
}

function isKnownKind(kind: string): kind is KnownKind {
  return (
    kind === "HEARTBEAT" ||
    kind === "COMMAND_ACK" ||
    kind === "COMMAND_RESULT" ||
    kind === "TASK_STATE" ||
    kind === "LOG"
  );
}

function stateFromTaskState(raw: string): "DONE" | "DISMISSED" | null {
  const k = raw.trim().toUpperCase();
  if (k === "DONE") return "DONE";
  if (k === "DISMISSED" || k === "IGNORED") return "DISMISSED";
  return null;
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

  try {
    await consumeRateLimit({
      key: `openclaws_events:user:${userId}`,
      windowSec: 60,
      limit: 600,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return jsonError(
        { error: "rate_limited", errorDescription: "Too many requests" },
        429,
      );
    }
    throw err;
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
  const openclawAgentId = clampString(obj.openclawAgentId, 128);
  if (!openclawAgentId) {
    return jsonError({
      error: "invalid_request",
      errorDescription: "Missing openclawAgentId",
    });
  }

  const eventsRaw = Array.isArray(obj.events) ? obj.events : [];
  const maxEvents = 50;
  const eventsIn: IncomingEvent[] = eventsRaw
    .slice(0, maxEvents)
    .map((e) =>
      e && typeof e === "object"
        ? (e as IncomingEvent)
        : ({ kind: "" } as IncomingEvent),
    );

  if (eventsIn.length === 0) {
    return jsonError({
      error: "invalid_request",
      errorDescription: "Missing events",
    });
  }

  const agent = await prisma.openClawAgent.findFirst({
    where: { id: openclawAgentId, createdByUserId: userId },
    select: { id: true, workspaceId: true },
  });
  if (!agent) {
    return jsonError({ error: "forbidden" }, 403);
  }

  const member = await hasWorkspaceMembership({
    userId,
    workspaceId: agent.workspaceId,
  });
  if (!member) {
    return jsonError({ error: "forbidden" }, 403);
  }

  const now = new Date();

  const normalized = eventsIn
    .map((e) => {
      const kind = normalizeKind(e.kind ?? "");
      if (!isKnownKind(kind)) return null;
      const commandId = clampString(e.commandId, 128) || null;
      const leaseId = clampString(e.leaseId, 128) || null;
      const tsMs = clampInt(e.tsMs, 0, 0, Number.MAX_SAFE_INTEGER);
      const createdAt = tsMs > 0 ? new Date(tsMs) : now;
      const payload =
        toInputJson(typeof e.data === "undefined" ? undefined : e.data) ?? null;
      return { kind, commandId, leaseId, createdAt, payload, raw: e };
    })
    .filter(Boolean) as Array<{
    kind: KnownKind;
    commandId: string | null;
    leaseId: string | null;
    createdAt: Date;
    payload: Prisma.InputJsonValue | null;
    raw: IncomingEvent;
  }>;

  if (normalized.length === 0) {
    return jsonError({
      error: "invalid_request",
      errorDescription: "No valid events",
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.openClawAgent.updateMany({
      where: { id: agent.id, createdByUserId: userId },
      data: { status: "ONLINE", lastSeenAt: now },
    });

    await tx.openClawEvent.createMany({
      data: normalized.map((e) => ({
        openclawAgentId: agent.id,
        commandId: e.commandId,
        kind: e.kind,
        leaseId: e.leaseId,
        payload: e.payload ?? undefined,
        createdAt: e.createdAt,
      })),
      skipDuplicates: false,
    });

    for (const evt of normalized) {
      if (!evt.commandId) continue;

      if (evt.kind === "COMMAND_ACK") {
        await tx.openClawCommand.updateMany({
          where: {
            id: evt.commandId,
            openclawAgentId: agent.id,
            state: "LEASED",
            ...(evt.leaseId ? { leaseId: evt.leaseId } : {}),
          },
          data: { state: "ACKED", ackedAt: now },
        });
        continue;
      }

      if (evt.kind === "COMMAND_RESULT") {
        const ok =
          evt.payload &&
          typeof evt.payload === "object" &&
          !Array.isArray(evt.payload)
            ? Boolean((evt.payload as Record<string, unknown>).ok)
            : false;
        const errorSummaryRaw =
          evt.payload &&
          typeof evt.payload === "object" &&
          !Array.isArray(evt.payload)
            ? clampString((evt.payload as Record<string, unknown>).error, 4000)
            : "";
        await tx.openClawCommand.updateMany({
          where: {
            id: evt.commandId,
            openclawAgentId: agent.id,
            state: { in: ["LEASED", "ACKED"] },
            ...(evt.leaseId ? { leaseId: evt.leaseId } : {}),
          },
          data: {
            state: ok ? "DONE" : "FAILED",
            finishedAt: now,
            result: evt.payload ?? undefined,
            errorSummary: ok ? null : errorSummaryRaw || null,
          },
        });
        continue;
      }

      if (evt.kind === "TASK_STATE") {
        const stateRaw =
          evt.payload &&
          typeof evt.payload === "object" &&
          !Array.isArray(evt.payload)
            ? clampString((evt.payload as Record<string, unknown>).state, 24)
            : "";
        const next = stateFromTaskState(stateRaw);
        if (!next) continue;
        await tx.openClawCommand.updateMany({
          where: {
            id: evt.commandId,
            openclawAgentId: agent.id,
            state: { in: ["PENDING", "LEASED", "ACKED"] },
            ...(evt.leaseId ? { leaseId: evt.leaseId } : {}),
          },
          data: {
            state: next,
            finishedAt: now,
            result: evt.payload ?? undefined,
          },
        });
      }
    }
  });

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
