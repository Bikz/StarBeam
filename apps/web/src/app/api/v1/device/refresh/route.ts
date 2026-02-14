import { prisma } from "@starbeam/db";
import { NextResponse } from "next/server";

import { mintAccessToken, mintRefreshToken, sha256Hex } from "@/lib/apiTokens";
import { clientIpFromHeaders } from "@/lib/clientIp";
import { consumeRateLimit, RateLimitError } from "@/lib/rateLimit";

type ErrorPayload = { error: string; errorDescription?: string };

function jsonError(payload: ErrorPayload, status = 400) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
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
  const refreshToken =
    typeof obj.refreshToken === "string" ? obj.refreshToken : "";
  if (!refreshToken) {
    return jsonError({
      error: "invalid_request",
      errorDescription: "Missing refreshToken",
    });
  }

  const tokenHash = sha256Hex(refreshToken);
  const now = new Date();

  const ip = clientIpFromHeaders(request.headers) || "unknown";
  const ipHash = sha256Hex(ip);
  try {
    await Promise.all([
      consumeRateLimit({
        key: `device_refresh:ip:${ipHash}`,
        windowSec: 5 * 60,
        limit: Number(process.env.STARB_DEVICE_REFRESH_IP_LIMIT_5M ?? "300"),
      }),
      consumeRateLimit({
        key: `device_refresh:token:${tokenHash}`,
        windowSec: 5 * 60,
        limit: Number(process.env.STARB_DEVICE_REFRESH_TOKEN_LIMIT_5M ?? "30"),
      }),
    ]);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return jsonError(
        { error: "rate_limited", errorDescription: "Too many requests" },
        429,
      );
    }
    throw err;
  }

  const existing = await prisma.apiRefreshToken.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
    select: {
      id: true,
      userId: true,
      clientKind: true,
      workspaceId: true,
      openclawAgentId: true,
    },
  });

  if (!existing) {
    return jsonError(
      { error: "invalid_token", errorDescription: "Refresh token invalid" },
      401,
    );
  }

  const access = await prisma.user.findUnique({
    where: { id: existing.userId },
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

  const rotated = mintRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const rotatedOk = await prisma.$transaction(async (tx) => {
    const revoked = await tx.apiRefreshToken.updateMany({
      where: { id: existing.id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    if (revoked.count !== 1) return false;

    await tx.apiRefreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: rotated.tokenHash,
        expiresAt: refreshExpiresAt,
        clientKind: existing.clientKind,
        workspaceId: existing.workspaceId,
        openclawAgentId: existing.openclawAgentId,
      },
    });
    return true;
  });

  if (!rotatedOk) {
    return jsonError(
      { error: "invalid_token", errorDescription: "Refresh token invalid" },
      401,
    );
  }

  const { token: accessToken, expiresIn } = mintAccessToken({
    userId: existing.userId,
    ttlSeconds: 60 * 60,
  });

  return NextResponse.json(
    { accessToken, refreshToken: rotated.refreshToken, expiresIn },
    { headers: { "Cache-Control": "no-store" } },
  );
}
