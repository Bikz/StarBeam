"use server";

import { prisma } from "@starbeam/db";
import { redirect } from "next/navigation";

import {
  encryptSecret,
  fetchNotionBot,
  normalizeSecret,
  requireMembership,
  scheduleAutoFirstPulseIfNeeded,
} from "@/app/(portal)/w/[slug]/integrations/_shared";

export async function connectNotion(workspaceSlug: string, formData: FormData) {
  const { userId, role, workspace } = await requireMembership(workspaceSlug);
  const token = normalizeSecret(formData.get("token"));
  if (!token) throw new Error("Missing token");

  const bot = await fetchNotionBot(token);
  const tokenEnc = encryptSecret(token);

  await prisma.notionConnection.upsert({
    where: {
      workspaceId_ownerUserId_notionBotId: {
        workspaceId: workspace.id,
        ownerUserId: userId,
        notionBotId: bot.botId,
      },
    },
    update: {
      tokenEnc,
      notionWorkspaceName: bot.workspaceName ?? null,
      status: "CONNECTED",
    },
    create: {
      workspaceId: workspace.id,
      ownerUserId: userId,
      notionBotId: bot.botId,
      notionWorkspaceName: bot.workspaceName ?? null,
      tokenEnc,
      status: "CONNECTED",
    },
  });

  await scheduleAutoFirstPulseIfNeeded({
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    userId,
    role,
  });

  redirect(`/w/${workspaceSlug}/integrations?connected=notion`);
}

export async function disconnectNotionConnection(
  workspaceSlug: string,
  connectionId: string,
) {
  const { userId, workspace } = await requireMembership(workspaceSlug);

  const existing = await prisma.notionConnection.findFirst({
    where: { id: connectionId, workspaceId: workspace.id, ownerUserId: userId },
    select: { id: true },
  });
  if (!existing) throw new Error("Connection not found");

  await prisma.notionConnection.delete({ where: { id: existing.id } });

  await prisma.sourceItem.deleteMany({
    where: {
      workspaceId: workspace.id,
      ownerUserId: userId,
      type: "NOTION_PAGE",
    },
  });

  redirect(`/w/${workspaceSlug}/integrations?disconnected=notion`);
}
