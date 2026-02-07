"use server";

import crypto from "node:crypto";

import { prisma } from "@starbeam/db";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function acceptInvite(token: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) throw new Error("Unauthorized");

  const tokenHash = sha256Hex(token);
  const invite = await prisma.invite.findUnique({
    where: { tokenHash },
    include: { workspace: true },
  });

  if (!invite) throw new Error("Invite not found");
  if (invite.usedAt) throw new Error("Invite already used");
  if (invite.expiresAt.getTime() < Date.now()) throw new Error("Invite expired");

  if (invite.email.toLowerCase() !== session.user.email.toLowerCase()) {
    throw new Error("Invite email mismatch");
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.upsert({
      where: {
        workspaceId_userId: { workspaceId: invite.workspaceId, userId: session.user.id },
      },
      update: {},
      create: { workspaceId: invite.workspaceId, userId: session.user.id, role: invite.role },
    });

    // Default behavior: if the workspace has a "default" department, add the user
    // to it so they see department-scoped pulse content without extra setup.
    const defaultDept = await tx.department.findFirst({
      where: { workspaceId: invite.workspaceId, enabled: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (defaultDept) {
      await tx.departmentMembership.upsert({
        where: { departmentId_userId: { departmentId: defaultDept.id, userId: session.user.id } },
        update: {},
        create: { departmentId: defaultDept.id, userId: session.user.id },
      });
    }

    await tx.invite.update({
      where: { id: invite.id },
      data: { usedAt: new Date(), usedByUserId: session.user.id },
    });
  });

  redirect(`/w/${invite.workspace.slug}`);
}
