import crypto from "node:crypto";

import { prisma, type Prisma } from "@starbeam/db";

type Tx = Prisma.TransactionClient;

function randomReferralCode(): string {
  // Short, URL-safe, case-sensitive.
  return crypto.randomBytes(9).toString("base64url"); // ~12 chars
}

export async function ensureReferralCodeForUser(
  tx: Tx,
  userId: string,
): Promise<string> {
  const existing = await tx.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (!existing) throw new Error("User not found");
  if (existing.referralCode) return existing.referralCode;

  // Collision is extremely unlikely, but handle it defensively.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = randomReferralCode();
    try {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { referralCode: code },
        select: { referralCode: true },
      });
      return updated.referralCode ?? code;
    } catch {
      // Likely a unique collision; retry.
    }
  }

  throw new Error("Failed to mint referral code");
}

export async function ensurePersonalWorkspaceForUser(
  tx: Tx,
  userId: string,
): Promise<void> {
  const slug = `personal-${userId}`;

  const existing = await tx.workspace.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!existing) {
    await tx.workspace.create({
      data: {
        slug,
        name: "Personal",
        type: "PERSONAL",
        createdById: userId,
        memberships: { create: { userId, role: "ADMIN" } },
        departments: {
          create: {
            name: "General",
            promptTemplate: "",
            enabled: true,
            memberships: { create: { userId } },
          },
        },
      },
    });
    return;
  }

  // Ensure membership exists (idempotent for older accounts).
  await tx.membership.upsert({
    where: { workspaceId_userId: { workspaceId: existing.id, userId } },
    update: {},
    create: { workspaceId: existing.id, userId, role: "ADMIN" },
  });
}

export async function provisionNewUser(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await ensureReferralCodeForUser(tx, userId);
    await ensurePersonalWorkspaceForUser(tx, userId);
  });
}

