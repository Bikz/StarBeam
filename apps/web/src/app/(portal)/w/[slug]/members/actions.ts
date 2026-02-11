"use server";

import crypto from "node:crypto";

import { prisma } from "@starbeam/db";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authOptions } from "@/lib/auth";

const CreateInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["MANAGER", "MEMBER"]),
});

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export async function createInvite(workspaceSlug: string, formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: true },
  });
  if (!membership) throw new Error("Not a member");
  if (membership.role !== "ADMIN") throw new Error("Admins only");

  const parsed = CreateInviteSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "MEMBER"),
  });
  if (!parsed.success) throw new Error("Invalid invite");

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.invite.create({
    data: {
      workspaceId: membership.workspace.id,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      tokenHash,
      expiresAt,
    },
  });

  redirect(`/w/${workspaceSlug}/members?invite=${encodeURIComponent(token)}`);
}

export async function assignMemberPrimaryTrack(
  workspaceSlug: string,
  targetUserId: string,
  formData: FormData,
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: true },
  });
  if (!membership) throw new Error("Not a member");
  if (!canManage(membership.role)) throw new Error("Managers/Admins only");

  const requestedDepartmentId = String(
    formData.get("primaryDepartmentId") ?? "",
  ).trim();
  if (!requestedDepartmentId) throw new Error("Track required");

  const workspaceDepartments = await prisma.department.findMany({
    where: { workspaceId: membership.workspace.id },
    select: { id: true, name: true, enabled: true },
    orderBy: { createdAt: "asc" },
  });

  const generalDepartment =
    workspaceDepartments.find((d) => d.name === "General") ??
    (await prisma.department.create({
      data: {
        workspaceId: membership.workspace.id,
        name: "General",
        promptTemplate: "",
        enabled: true,
      },
      select: { id: true, name: true, enabled: true },
    }));

  const selectedDepartment =
    workspaceDepartments.find((d) => d.id === requestedDepartmentId) ??
    (generalDepartment.id === requestedDepartmentId ? generalDepartment : null);
  if (!selectedDepartment) throw new Error("Track not found");
  if (!selectedDepartment.enabled && selectedDepartment.name !== "General") {
    throw new Error("Track is disabled");
  }

  const targetMembership = await prisma.membership.findFirst({
    where: { workspaceId: membership.workspace.id, userId: targetUserId },
    select: { id: true, userId: true },
  });
  if (!targetMembership) throw new Error("Member not found");

  const workspaceDepartmentIds = [
    ...new Set(
      [...workspaceDepartments.map((d) => d.id), generalDepartment.id].filter(
        Boolean,
      ),
    ),
  ];

  const keepIds =
    selectedDepartment.id === generalDepartment.id
      ? [generalDepartment.id]
      : [generalDepartment.id, selectedDepartment.id];

  await prisma.$transaction(async (tx) => {
    await tx.departmentMembership.upsert({
      where: {
        departmentId_userId: {
          departmentId: generalDepartment.id,
          userId: targetMembership.userId,
        },
      },
      update: {},
      create: {
        departmentId: generalDepartment.id,
        userId: targetMembership.userId,
      },
    });

    if (selectedDepartment.id !== generalDepartment.id) {
      await tx.departmentMembership.upsert({
        where: {
          departmentId_userId: {
            departmentId: selectedDepartment.id,
            userId: targetMembership.userId,
          },
        },
        update: {},
        create: {
          departmentId: selectedDepartment.id,
          userId: targetMembership.userId,
        },
      });
    }

    if (workspaceDepartmentIds.length > 0) {
      await tx.departmentMembership.deleteMany({
        where: {
          userId: targetMembership.userId,
          departmentId: { in: workspaceDepartmentIds, notIn: keepIds },
        },
      });
    }

    await tx.membership.update({
      where: { id: targetMembership.id },
      data: { primaryDepartmentId: selectedDepartment.id },
    });
  });

  redirect(`/w/${workspaceSlug}/members`);
}
