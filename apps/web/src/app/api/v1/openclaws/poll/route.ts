import crypto from "node:crypto";

import { prisma } from "@starbeam/db";
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

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
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
      key: `openclaws_poll:user:${userId}`,
      windowSec: 60,
      limit: 240,
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
  const openclawAgentId =
    typeof obj.openclawAgentId === "string" ? obj.openclawAgentId.trim() : "";
  if (!openclawAgentId) {
    return jsonError({
      error: "invalid_request",
      errorDescription: "Missing openclawAgentId",
    });
  }

  const limit = clampInt(obj.limit, 5, 1, 20);
  const longPollMs = clampInt(obj.longPollMs, 0, 0, 25_000);
  const leaseMs = 60_000;

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

  const leaseOnce = async () => {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);

    const leased = await prisma.$transaction(async (tx) => {
      await tx.openClawAgent.updateMany({
        where: { id: agent.id, createdByUserId: userId },
        data: { status: "ONLINE", lastSeenAt: now },
      });

      const candidates = await tx.openClawCommand.findMany({
        where: {
          openclawAgentId: agent.id,
          OR: [
            { state: "PENDING" },
            { state: "LEASED", leaseExpiresAt: { lte: now } },
          ],
        },
        orderBy: { createdAt: "asc" },
        take: limit,
        select: { id: true, type: true, payload: true },
      });

      const out: Array<{
        id: string;
        type: string;
        payload: unknown;
        leaseId: string;
      }> = [];
      for (const cmd of candidates) {
        const nextLeaseId = crypto.randomBytes(16).toString("hex");
        const updated = await tx.openClawCommand.updateMany({
          where: {
            id: cmd.id,
            openclawAgentId: agent.id,
            OR: [
              { state: "PENDING" },
              { state: "LEASED", leaseExpiresAt: { lte: now } },
            ],
          },
          data: {
            state: "LEASED",
            leaseId: nextLeaseId,
            leasedAt: now,
            leaseExpiresAt,
          },
        });
        if (updated.count === 1) {
          out.push({
            id: cmd.id,
            type: cmd.type,
            payload: cmd.payload,
            leaseId: nextLeaseId,
          });
        }
      }

      return out;
    });

    return { leased, now };
  };

  let { leased, now } = await leaseOnce();
  if (leased.length === 0 && longPollMs > 0) {
    const deadline = Date.now() + longPollMs;
    while (leased.length === 0 && Date.now() < deadline) {
      await sleep(900);
      const res = await leaseOnce();
      leased = res.leased;
      now = res.now;
    }
  }

  return NextResponse.json(
    { ok: true, commands: leased, serverTs: now.toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
