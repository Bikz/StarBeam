import crypto from "node:crypto";

import { prisma } from "@starbeam/db";

import { recordUsageEventSafe } from "@/lib/usageEvents";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

type AcceptInviteError =
  | "not_found"
  | "expired"
  | "already_used"
  | "email_mismatch";

type AcceptInviteResult =
  | { ok: true; workspaceSlug: string; workspaceId: string }
  | { ok: false; error: AcceptInviteError };

export async function acceptInviteForUser(args: {
  token: string;
  userId: string;
  userEmail: string;
  now?: Date;
}): Promise<AcceptInviteResult> {
  const tokenHash = sha256Hex(args.token);

  const result = await prisma.$transaction<AcceptInviteResult>(async (tx) => {
    const now = args.now ?? new Date();

    const invite = await tx.invite.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        usedAt: true,
        workspaceId: true,
        workspace: { select: { slug: true } },
      },
    });

    if (!invite) return { ok: false, error: "not_found" };

    if (invite.email.toLowerCase() !== args.userEmail.toLowerCase()) {
      return { ok: false, error: "email_mismatch" };
    }

    const claimed = await tx.invite.updateMany({
      where: { id: invite.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now, usedByUserId: args.userId },
    });

    if (claimed.count !== 1) {
      const fresh = await tx.invite.findUnique({
        where: { id: invite.id },
        select: { usedAt: true, expiresAt: true },
      });

      if (fresh?.usedAt) return { ok: false, error: "already_used" };
      if (fresh && fresh.expiresAt.getTime() <= now.getTime()) {
        return { ok: false, error: "expired" };
      }

      // Default to "already used" so retries remain deterministic without
      // leaking internal state.
      return { ok: false, error: "already_used" };
    }

    const generalDept = await tx.department.findFirst({
      where: { workspaceId: invite.workspaceId, name: "General" },
      select: { id: true },
    });
    const defaultDept =
      generalDept ??
      (await tx.department.findFirst({
        where: { workspaceId: invite.workspaceId, enabled: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      }));

    await tx.membership.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: invite.workspaceId,
          userId: args.userId,
        },
      },
      update: {},
      create: {
        workspaceId: invite.workspaceId,
        userId: args.userId,
        role: invite.role,
        primaryDepartmentId: defaultDept?.id ?? null,
      },
    });

    if (defaultDept) {
      await tx.membership.updateMany({
        where: {
          workspaceId: invite.workspaceId,
          userId: args.userId,
          primaryDepartmentId: null,
        },
        data: { primaryDepartmentId: defaultDept.id },
      });
    }

    // Treat a workspace invite as product access (private beta).
    await tx.user.updateMany({
      where: { id: args.userId, betaAccessGrantedAt: null },
      data: { betaAccessGrantedAt: now },
    });

    if (defaultDept) {
      await tx.departmentMembership.upsert({
        where: {
          departmentId_userId: {
            departmentId: defaultDept.id,
            userId: args.userId,
          },
        },
        update: {},
        create: { departmentId: defaultDept.id, userId: args.userId },
      });
    }

    return {
      ok: true,
      workspaceSlug: invite.workspace.slug,
      workspaceId: invite.workspaceId,
    };
  });

  if (result.ok) {
    await recordUsageEventSafe({
      eventType: "INVITE_ACCEPTED",
      source: "web",
      workspaceId: result.workspaceId,
      userId: args.userId,
      metadata: {
        workspaceSlug: result.workspaceSlug,
      },
    });
  }

  return result;
}
