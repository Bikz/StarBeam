"use server";

import { prisma } from "@starbeam/db";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authOptions } from "@/lib/auth";

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

const CreateGoalSchema = z.object({
  title: z.string().min(3).max(90),
  body: z.string().max(4000).optional(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  departmentId: z.string().min(1),
  targetDate: z.string().optional(),
});

export async function createGoal(workspaceSlug: string, formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: true },
  });
  if (!membership) throw new Error("Not a member");
  if (!canManage(membership.role)) throw new Error("Managers/Admins only");

  const parsed = CreateGoalSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    priority: String(formData.get("priority") ?? "MEDIUM"),
    departmentId: String(formData.get("departmentId") ?? ""),
    targetDate: String(formData.get("targetDate") ?? ""),
  });
  if (!parsed.success) throw new Error("Invalid goal");

  const activeCount = await prisma.goal.count({
    where: { workspaceId: membership.workspace.id, active: true },
  });
  if (activeCount >= 5) {
    throw new Error("Too many active goals (max 5)");
  }

  const departmentId = parsed.data.departmentId.trim();
  const dept = await prisma.department.findFirst({
    where: { id: departmentId, workspaceId: membership.workspace.id },
    select: { id: true },
  });
  if (!dept) throw new Error("Track not found");

  const targetDateText = parsed.data.targetDate?.trim() ?? "";
  const targetDate = targetDateText
    ? new Date(`${targetDateText}T00:00:00.000Z`)
    : null;

  await prisma.goal.create({
    data: {
      workspaceId: membership.workspace.id,
      departmentId,
      authorUserId: session.user.id,
      title: parsed.data.title.trim(),
      body: (parsed.data.body ?? "").trim(),
      priority: parsed.data.priority ?? "MEDIUM",
      targetDate,
      active: true,
    },
  });

  redirect(
    `/w/${workspaceSlug}/tracks?track=${encodeURIComponent(departmentId)}`,
  );
}

export async function toggleGoalActive(workspaceSlug: string, goalId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: true },
  });
  if (!membership) throw new Error("Not a member");
  if (!canManage(membership.role)) throw new Error("Managers/Admins only");

  const goal = await prisma.goal.findFirst({
    where: { id: goalId, workspaceId: membership.workspace.id },
  });
  if (!goal) throw new Error("Goal not found");

  if (!goal.active) {
    const activeCount = await prisma.goal.count({
      where: { workspaceId: membership.workspace.id, active: true },
    });
    if (activeCount >= 5) {
      throw new Error("Too many active goals (max 5)");
    }
  }

  await prisma.goal.update({
    where: { id: goal.id },
    data: { active: !goal.active },
  });

  redirect(
    `/w/${workspaceSlug}/tracks?track=${encodeURIComponent(goal.departmentId ?? "")}`,
  );
}

export async function deleteGoal(workspaceSlug: string, goalId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: true },
  });
  if (!membership) throw new Error("Not a member");
  if (!canManage(membership.role)) throw new Error("Managers/Admins only");

  const goal = await prisma.goal.findFirst({
    where: { id: goalId, workspaceId: membership.workspace.id },
    select: { id: true, departmentId: true },
  });
  if (!goal) throw new Error("Goal not found");

  await prisma.goal.delete({ where: { id: goal.id } });

  redirect(
    `/w/${workspaceSlug}/tracks?track=${encodeURIComponent(goal.departmentId ?? "")}`,
  );
}
