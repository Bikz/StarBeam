"use server";

import { prisma } from "@starbeam/db";
import { makeWorkerUtils, runMigrations } from "graphile-worker";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rateLimit";

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

const CreateAnnouncementSchema = z.object({
  title: z.string().min(3).max(90),
  body: z.string().max(8000).optional(),
  pinned: z.enum(["on"]).optional(),
});

function requireDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL");
  return connectionString;
}

function parseEnvLimit(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

async function consumeAnnouncementMutationRateLimit(args: {
  userId: string;
  workspaceId: string;
}) {
  await consumeRateLimit({
    key: `ann_mut:user:${args.userId}`,
    windowSec: 60,
    limit: parseEnvLimit("STARB_ANN_MUT_USER_LIMIT_1M", 10),
  });
  await consumeRateLimit({
    key: `ann_mut:workspace:${args.workspaceId}`,
    windowSec: 60,
    limit: parseEnvLimit("STARB_ANN_MUT_WORKSPACE_LIMIT_1M", 30),
  });
}

async function enqueueAnnouncementsRefresh(args: {
  workspaceId: string;
  triggeredByUserId: string;
}) {
  const jobKey = `nightly_workspace_run:announcements:${args.workspaceId}`;
  const jobRunId = `announcements:${args.workspaceId}`;

  await prisma.jobRun.upsert({
    where: { id: jobRunId },
    update: {
      workspaceId: args.workspaceId,
      kind: "NIGHTLY_WORKSPACE_RUN",
      status: "QUEUED",
      startedAt: null,
      finishedAt: null,
      errorSummary: null,
      meta: {
        triggeredByUserId: args.triggeredByUserId,
        source: "announcements",
        includeInactive: true,
        jobKey,
      },
    },
    create: {
      id: jobRunId,
      workspaceId: args.workspaceId,
      kind: "NIGHTLY_WORKSPACE_RUN",
      status: "QUEUED",
      meta: {
        triggeredByUserId: args.triggeredByUserId,
        source: "announcements",
        includeInactive: true,
        jobKey,
      },
    },
  });

  const connectionString = requireDatabaseUrl();
  await runMigrations({ connectionString });

  const workerUtils = await makeWorkerUtils({ connectionString });
  try {
    await workerUtils.addJob(
      "nightly_workspace_run",
      {
        workspaceId: args.workspaceId,
        jobRunId,
        includeInactive: true,
      },
      { jobKey, jobKeyMode: "replace", runAt: new Date() },
    );
  } finally {
    await workerUtils.release();
  }
}

async function enqueueDismissRefresh(args: {
  workspaceId: string;
  userId: string;
  triggeredByUserId: string;
}) {
  const jobKey = `nightly_workspace_run:announcements_dismiss:${args.workspaceId}:${args.userId}`;
  const jobRunId = `announcements-dismiss:${args.workspaceId}:${args.userId}`;

  await prisma.jobRun.upsert({
    where: { id: jobRunId },
    update: {
      workspaceId: args.workspaceId,
      kind: "NIGHTLY_WORKSPACE_RUN",
      status: "QUEUED",
      startedAt: null,
      finishedAt: null,
      errorSummary: null,
      meta: {
        triggeredByUserId: args.triggeredByUserId,
        userId: args.userId,
        source: "announcements-dismiss",
        jobKey,
      },
    },
    create: {
      id: jobRunId,
      workspaceId: args.workspaceId,
      kind: "NIGHTLY_WORKSPACE_RUN",
      status: "QUEUED",
      meta: {
        triggeredByUserId: args.triggeredByUserId,
        userId: args.userId,
        source: "announcements-dismiss",
        jobKey,
      },
    },
  });

  const connectionString = requireDatabaseUrl();
  await runMigrations({ connectionString });

  const workerUtils = await makeWorkerUtils({ connectionString });
  try {
    await workerUtils.addJob(
      "nightly_workspace_run",
      { workspaceId: args.workspaceId, jobRunId, userId: args.userId },
      { jobKey, jobKeyMode: "replace", runAt: new Date() },
    );
  } finally {
    await workerUtils.release();
  }
}

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

  await consumeAnnouncementMutationRateLimit({
    userId: session.user.id,
    workspaceId: membership.workspace.id,
  });

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

  await enqueueAnnouncementsRefresh({
    workspaceId: membership.workspace.id,
    triggeredByUserId: session.user.id,
  });

  redirect(`/w/${workspaceSlug}/announcements?notice=created`);
}

export async function updateAnnouncement(
  workspaceSlug: string,
  announcementId: string,
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

  await consumeAnnouncementMutationRateLimit({
    userId: session.user.id,
    workspaceId: membership.workspace.id,
  });

  const parsed = CreateAnnouncementSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    pinned: formData.get("pinned") ? "on" : undefined,
  });
  if (!parsed.success) throw new Error("Invalid announcement");

  const existing = await prisma.announcement.findFirst({
    where: { id: announcementId, workspaceId: membership.workspace.id },
    select: { id: true },
  });
  if (!existing) throw new Error("Announcement not found");

  await prisma.announcement.update({
    where: { id: existing.id },
    data: {
      title: parsed.data.title.trim(),
      body: (parsed.data.body ?? "").trim(),
      pinned: Boolean(parsed.data.pinned),
    },
  });

  await enqueueAnnouncementsRefresh({
    workspaceId: membership.workspace.id,
    triggeredByUserId: session.user.id,
  });

  redirect(`/w/${workspaceSlug}/announcements?notice=updated`);
}

export async function deleteAnnouncement(
  workspaceSlug: string,
  announcementId: string,
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

  await consumeAnnouncementMutationRateLimit({
    userId: session.user.id,
    workspaceId: membership.workspace.id,
  });

  const confirmed = formData.get("confirm") ? "on" : "";
  if (confirmed !== "on") throw new Error("Confirm deletion");

  const existing = await prisma.announcement.findFirst({
    where: { id: announcementId, workspaceId: membership.workspace.id },
    select: { id: true },
  });
  if (!existing) throw new Error("Announcement not found");

  await prisma.announcement.delete({ where: { id: existing.id } });

  await enqueueAnnouncementsRefresh({
    workspaceId: membership.workspace.id,
    triggeredByUserId: session.user.id,
  });

  redirect(`/w/${workspaceSlug}/announcements?notice=deleted`);
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

  await consumeAnnouncementMutationRateLimit({
    userId: session.user.id,
    workspaceId: membership.workspace.id,
  });

  const a = await prisma.announcement.findFirst({
    where: { id: announcementId, workspaceId: membership.workspace.id },
  });
  if (!a) throw new Error("Announcement not found");

  await prisma.announcement.update({
    where: { id: a.id },
    data: { pinned: !a.pinned },
  });

  await enqueueAnnouncementsRefresh({
    workspaceId: membership.workspace.id,
    triggeredByUserId: session.user.id,
  });

  redirect(`/w/${workspaceSlug}/announcements?notice=updated`);
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

  await enqueueDismissRefresh({
    workspaceId: membership.workspace.id,
    userId: session.user.id,
    triggeredByUserId: session.user.id,
  });

  redirect(`/w/${workspaceSlug}/announcements?notice=updated`);
}
