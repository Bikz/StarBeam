import { prisma } from "@starbeam/db";

import { parseAccessToken, sha256Hex } from "@/lib/apiTokens";

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function userIdFromRefreshToken(
  request: Request,
): Promise<string | null> {
  const refreshToken = (
    request.headers.get("x-starbeam-refresh-token") ?? ""
  ).trim();
  if (!refreshToken) return null;

  const tokenHash = sha256Hex(refreshToken);
  const now = new Date();

  const existing = await prisma.apiRefreshToken.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
    select: { userId: true },
  });

  return existing?.userId ?? null;
}

export async function getUserIdFromMacOSAuth(
  request: Request,
): Promise<string | null> {
  const token = getBearerToken(request);
  if (token) {
    try {
      const payload = parseAccessToken(token);
      return payload.sub;
    } catch {
      // Fall back to refresh token header.
    }
  }

  return await userIdFromRefreshToken(request);
}

export async function requireBetaAccess(userId: string): Promise<boolean> {
  const access = await prisma.user.findUnique({
    where: { id: userId },
    select: { betaAccessGrantedAt: true },
  });
  return Boolean(access?.betaAccessGrantedAt);
}

export async function hasWorkspaceMembership(args: {
  userId: string;
  workspaceId: string;
}): Promise<boolean> {
  const membership = await prisma.membership.findFirst({
    where: { workspaceId: args.workspaceId, userId: args.userId },
    select: { id: true },
  });
  return Boolean(membership?.id);
}
