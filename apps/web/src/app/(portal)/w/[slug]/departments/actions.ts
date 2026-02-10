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

    const workspaceMembers = await tx.membership.findMany({
      where: { workspaceId: membership.workspace.id },
      select: { userId: true },
    });

    if (workspaceMembers.length) {
      await tx.departmentMembership.createMany({
        data: workspaceMembers.map((m) => ({
          departmentId: dept.id,
          userId: m.userId,
        })),
        skipDuplicates: true,
      });
    }

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

  const res = await prisma.department.updateMany({
    where: { id: departmentId, workspaceId: membership.workspace.id },
    data: { promptTemplate, enabled: Boolean(parsed.data.enabled) },
  });
  if (res.count === 0) throw new Error("Department not found");

  redirect(
    `/w/${workspaceSlug}/tracks?track=${encodeURIComponent(departmentId)}`,
  );
}
