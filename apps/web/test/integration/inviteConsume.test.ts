import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { prisma } from "@starbeam/db";

import { acceptInviteForUser } from "../../src/lib/invites";

function hasDatabaseUrl(): boolean {
  return (
    typeof process.env.DATABASE_URL === "string" &&
    process.env.DATABASE_URL.length > 0
  );
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

test(
  "acceptInviteForUser consumes an invite exactly once under concurrency",
  { skip: !hasDatabaseUrl() },
  async () => {
    const now = new Date();
    const t = Date.now();
    const invitedEmail = `invite-integration-invited-${t}@starbeamhq.com`;

    const creator = await prisma.user.create({
      data: { email: `invite-integration-creator-${t}@starbeamhq.com` },
      select: { id: true },
    });

    const invited = await prisma.user.create({
      data: { email: invitedEmail },
      select: { id: true },
    });

    const workspace = await prisma.workspace.create({
      data: {
        slug: `invite-integration-${t}`,
        name: "Invite Integration",
        type: "ORG",
        createdById: creator.id,
        memberships: { create: { userId: creator.id, role: "ADMIN" } },
      },
      select: { id: true },
    });

    const token = `invite-token-${t}-${Math.random().toString(16).slice(2)}`;
    const tokenHash = sha256Hex(token);

    const invite = await prisma.invite.create({
      data: {
        workspaceId: workspace.id,
        email: invitedEmail,
        role: "MEMBER",
        tokenHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      select: { id: true },
    });

    try {
      const [a, b] = await Promise.all([
        acceptInviteForUser({
          token,
          userId: invited.id,
          userEmail: invitedEmail,
          now,
        }),
        acceptInviteForUser({
          token,
          userId: invited.id,
          userEmail: invitedEmail,
          now,
        }),
      ]);

      const okCount = [a, b].filter((r) => r.ok).length;
      assert.equal(okCount, 1);

      const inviteAfter = await prisma.invite.findUnique({
        where: { id: invite.id },
        select: { usedAt: true, usedByUserId: true },
      });
      assert.ok(inviteAfter?.usedAt instanceof Date);
      assert.equal(inviteAfter?.usedByUserId, invited.id);

      const membership = await prisma.membership.findUnique({
        where: {
          workspaceId_userId: { workspaceId: workspace.id, userId: invited.id },
        },
        select: { id: true },
      });
      assert.ok(membership?.id);
    } finally {
      await prisma.workspace.delete({ where: { id: workspace.id } });
      await prisma.user.deleteMany({
        where: { id: { in: [creator.id, invited.id] } },
      });
    }
  },
);
