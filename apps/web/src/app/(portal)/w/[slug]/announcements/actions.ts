"use server";

import { prisma } from "@starbeam/db";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authOptions } from "@/lib/auth";

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

const CreateAnnouncementSchema = z.object({
  title: z.string().min(3).max(90),
  body: z.string().max(8000).optional(),
  pinned: z.enum(["on"]).optional(),
});

export async function createAnnouncement(
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

  const parsed = CreateAnnouncementSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    pinned: formData.get("pinned") ? "on" : undefined,
  });
  if (!parsed.success) throw new Error("Invalid announcement");

  await prisma.announcement.create({
    data: {
      workspaceId: membership.workspace.id,
      authorUserId: session.user.id,
      title: parsed.data.title.trim(),
      body: (parsed.data.body ?? "").trim(),
      pinned: Boolean(parsed.data.pinned),
    },
  });

  redirect(`/w/${workspaceSlug}/announcements`);
}

export async function toggleAnnouncementPinned(
  workspaceSlug: string,
  announcementId: string,
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: true },
  });
  if (!membership) throw new Error("Not a member");
  if (!canManage(membership.role)) throw new Error("Managers/Admins only");

  const a = await prisma.announcement.findFirst({
    where: { id: announcementId, workspaceId: membership.workspace.id },
  });
  if (!a) throw new Error("Announcement not found");

  await prisma.announcement.update({
    where: { id: a.id },
    data: { pinned: !a.pinned },
  });

  redirect(`/w/${workspaceSlug}/announcements`);
}

export async function dismissAnnouncement(
  workspaceSlug: string,
  announcementId: string,
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: true },
  });
  if (!membership) throw new Error("Not a member");

  const announcement = await prisma.announcement.findFirst({
    where: { id: announcementId, workspaceId: membership.workspace.id },
    select: { id: true },
  });
  if (!announcement) throw new Error("Announcement not found");

  await prisma.announcementDismiss.upsert({
    where: {
      announcementId_userId: {
        announcementId: announcement.id,
        userId: session.user.id,
      },
    },
    update: {},
    create: { announcementId: announcement.id, userId: session.user.id },
  });

  redirect(`/w/${workspaceSlug}/announcements`);
}
