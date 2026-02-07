import { prisma } from "@starbeam/db";
import { NextResponse } from "next/server";

import { mintAccessToken, mintRefreshToken, sha256Hex } from "@/lib/apiTokens";
import { consumeRateLimit } from "@/lib/rateLimit";

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
  await consumeRateLimit({
    key: `device_exchange:${ipHash}`,
    windowSec: 5 * 60,
    limit: Number(process.env.STARB_DEVICE_EXCHANGE_LIMIT_5M ?? "120") || 120,
  });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError({ error: "invalid_request", errorDescription: "Invalid JSON" });
  }

  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
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

  const { refreshToken, tokenHash } = mintRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.deviceAuthRequest.update({
      where: { id: authReq.id },
      data: { status: "CONSUMED", consumedAt: now },
    });
    await tx.apiRefreshToken.create({
      data: { userId, tokenHash, expiresAt: refreshExpiresAt },
    });
  });

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
