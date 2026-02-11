"use server";

import { prisma } from "@starbeam/db";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authOptions } from "@/lib/auth";

const CreateDepartmentSchema = z.object({
  name: z.string().min(2).max(48),
  promptTemplate: z.string().max(8000).optional(),
});

const UpdateDepartmentSchema = z.object({
  promptTemplate: z.string().max(12000).optional(),
  enabled: z.enum(["on"]).optional(),
});

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export async function createDepartment(
  workspaceSlug: string,
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

  const parsed = CreateDepartmentSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    promptTemplate: String(formData.get("promptTemplate") ?? ""),
  });
  if (!parsed.success) throw new Error("Invalid department");

  const promptTemplate = (parsed.data.promptTemplate ?? "").trim();

  const deptId = await prisma.$transaction(async (tx) => {
    const dept = await tx.department.create({
      data: {
        workspaceId: membership.workspace.id,
        name: parsed.data.name.trim(),
        promptTemplate,
      },
    });

    await tx.departmentMembership.upsert({
      where: {
        departmentId_userId: {
          departmentId: dept.id,
          userId: session.user.id,
        },
      },
      update: {},
      create: { departmentId: dept.id, userId: session.user.id },
    });

    return dept.id;
  });

  redirect(`/w/${workspaceSlug}/tracks?track=${encodeURIComponent(deptId)}`);
}

export async function updateDepartment(
  workspaceSlug: string,
  departmentId: string,
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

  const parsed = UpdateDepartmentSchema.safeParse({
    promptTemplate: String(formData.get("promptTemplate") ?? ""),
    enabled: formData.get("enabled") ? "on" : undefined,
  });
  if (!parsed.success) throw new Error("Invalid update");

  const promptTemplate = (parsed.data.promptTemplate ?? "").trim();
  const enabled = Boolean(parsed.data.enabled);

  const existing = await prisma.department.findFirst({
    where: { id: departmentId, workspaceId: membership.workspace.id },
    select: { id: true, name: true },
  });
  if (!existing) throw new Error("Department not found");
  if (existing.name === "General" && !enabled) {
    throw new Error("General track cannot be disabled");
  }

  await prisma.$transaction(async (tx) => {
    await tx.department.update({
      where: { id: departmentId },
      data: { promptTemplate, enabled },
    });

    if (!enabled) {
      const general = await tx.department.findFirst({
        where: { workspaceId: membership.workspace.id, name: "General" },
        select: { id: true },
      });
      if (general?.id) {
        await tx.membership.updateMany({
          where: {
            workspaceId: membership.workspace.id,
            primaryDepartmentId: departmentId,
          },
          data: { primaryDepartmentId: general.id },
        });

        await tx.departmentMembership.deleteMany({
          where: { departmentId },
        });
      }
    }
  });

  redirect(
    `/w/${workspaceSlug}/tracks?track=${encodeURIComponent(departmentId)}`,
  );
}
