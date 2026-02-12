import { prisma } from "@starbeam/db";
import { NextResponse } from "next/server";

import { mintAccessToken, mintRefreshToken, sha256Hex } from "@/lib/apiTokens";
import { consumeRateLimit, RateLimitError } from "@/lib/rateLimit";

type ErrorPayload = { error: string; errorDescription?: string };

function jsonError(payload: ErrorPayload, status = 400) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  const xrip = req.headers.get("x-real-ip");
  if (xrip) return xrip.trim();
  return "unknown";
}

export async function POST(request: Request) {
  const ipHash = sha256Hex(clientIp(request));
  try {
    await consumeRateLimit({
      key: `device_exchange:${ipHash}`,
      windowSec: 5 * 60,
      limit: Number(process.env.STARB_DEVICE_EXCHANGE_LIMIT_5M ?? "120") || 120,
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
  const deviceCode = typeof obj.deviceCode === "string" ? obj.deviceCode : "";
  if (!deviceCode) {
    return jsonError({
      error: "invalid_request",
      errorDescription: "Missing deviceCode",
    });
  }

  const deviceCodeHash = sha256Hex(deviceCode);
  const authReq = await prisma.deviceAuthRequest.findUnique({
    where: { deviceCodeHash },
    select: { id: true, status: true, approvedUserId: true, expiresAt: true },
  });
  if (!authReq) {
    return jsonError({
      error: "invalid_device_code",
      errorDescription: "Device code not found",
    });
  }

  const now = new Date();
  if (authReq.expiresAt <= now) {
    return jsonError({
      error: "expired_token",
      errorDescription: "Device code expired",
    });
  }

  if (authReq.status === "PENDING") {
    return jsonError({
      error: "authorization_pending",
      errorDescription: "Waiting for user approval",
    });
  }

  if (authReq.status === "CONSUMED") {
    return jsonError({
      error: "invalid_grant",
      errorDescription: "Device code already used",
    });
  }

  const userId = authReq.approvedUserId;
  if (!userId) {
    return jsonError(
      { error: "server_error", errorDescription: "Missing approved user" },
      500,
    );
  }

  const access = await prisma.user.findUnique({
    where: { id: userId },
    select: { betaAccessGrantedAt: true },
  });
  if (!access?.betaAccessGrantedAt) {
    return jsonError(
      {
        error: "access_denied",
        errorDescription: "Private beta access required",
      },
      403,
    );
  }

  const { refreshToken, tokenHash } = mintRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const consumed = await prisma.$transaction(async (tx) => {
    const updated = await tx.deviceAuthRequest.updateMany({
      where: {
        id: authReq.id,
        status: "APPROVED",
        approvedUserId: userId,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { status: "CONSUMED", consumedAt: now },
    });

    if (updated.count !== 1) return false;

    await tx.apiRefreshToken.create({
      data: { userId, tokenHash, expiresAt: refreshExpiresAt },
    });

    return true;
  });

  if (!consumed) {
    const current = await prisma.deviceAuthRequest.findUnique({
      where: { id: authReq.id },
      select: { status: true, expiresAt: true },
    });

    if (!current) {
      return jsonError({
        error: "invalid_grant",
        errorDescription: "Invalid code",
      });
    }
    if (current.expiresAt <= now) {
      return jsonError({
        error: "expired_token",
        errorDescription: "Device code expired",
      });
    }
    if (current.status === "PENDING") {
      return jsonError({
        error: "authorization_pending",
        errorDescription: "Waiting for user approval",
      });
    }
    return jsonError({
      error: "invalid_grant",
      errorDescription: "Device code already used",
    });
  }

  const { token: accessToken, expiresIn } = mintAccessToken({
    userId,
    ttlSeconds: 60 * 60,
  });

  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, image: true },
    }),
    prisma.membership.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!user?.email) {
    return jsonError(
      { error: "server_error", errorDescription: "User missing email" },
      500,
    );
  }

  const workspaces = memberships.map((m) => ({
    id: m.workspace.id,
    type: m.workspace.type,
    name: m.workspace.name,
    slug: m.workspace.slug,
  }));

  return NextResponse.json(
    { accessToken, refreshToken, expiresIn, user, workspaces },
    { headers: { "Cache-Control": "no-store" } },
  );
}
