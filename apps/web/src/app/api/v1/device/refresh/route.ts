import { prisma } from "@starbeam/db";
import { NextResponse } from "next/server";

import { mintAccessToken, mintRefreshToken, sha256Hex } from "@/lib/apiTokens";

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

  const existing = await prisma.apiRefreshToken.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
    select: { id: true, userId: true },
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

  await prisma.$transaction(async (tx) => {
    await tx.apiRefreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: now },
    });
    await tx.apiRefreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: rotated.tokenHash,
        expiresAt: refreshExpiresAt,
      },
    });
  });

  const { token: accessToken, expiresIn } = mintAccessToken({
    userId: existing.userId,
    ttlSeconds: 60 * 60,
  });

  return NextResponse.json(
    { accessToken, refreshToken: rotated.refreshToken, expiresIn },
    { headers: { "Cache-Control": "no-store" } },
  );
}
