"use server";

import { prisma } from "@starbeam/db";
import { redirect } from "next/navigation";

import {
  encryptSecret,
  normalizeSecret,
  requireMembership,
  scheduleAutoFirstPulseIfNeeded,
} from "@/app/(portal)/w/[slug]/integrations/_shared";
import type { ConnectState } from "@/app/(portal)/w/[slug]/integrations/connectState";
import { fetchNotionBot } from "@/app/(portal)/w/[slug]/integrations/providerCheck";
import { friendlyProviderError } from "@/app/(portal)/w/[slug]/integrations/providerErrors";

export async function connectNotionAction(
  workspaceSlug: string,
  _prev: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const { userId, role, workspace } = await requireMembership(workspaceSlug);
  const token = normalizeSecret(formData.get("token"));
  if (!token) {
    return {
      ok: false,
      fieldErrors: { token: "Paste an integration token to continue." },
    };
  }

  const bot = await fetchNotionBot(token);
  if (!bot.ok) {
    return { ok: false, message: friendlyProviderError("notion", bot) };
  }

  const tokenEnc = encryptSecret(token);

  await prisma.notionConnection.upsert({
    where: {
      workspaceId_ownerUserId_notionBotId: {
        workspaceId: workspace.id,
        ownerUserId: userId,
        notionBotId: bot.value.botId,
      },
    },
    update: {
      tokenEnc,
      notionWorkspaceName: bot.value.workspaceName ?? null,
      status: "CONNECTED",
    },
    create: {
      workspaceId: workspace.id,
      ownerUserId: userId,
      notionBotId: bot.value.botId,
      notionWorkspaceName: bot.value.workspaceName ?? null,
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

export async function connectNotion(workspaceSlug: string, formData: FormData) {
  // Backwards-compatible wrapper; prefer connectNotionAction for inline errors.
  const res = await connectNotionAction(workspaceSlug, { ok: true }, formData);
  if (!res.ok) {
    throw new Error(
      res.fieldErrors?.token ?? res.message ?? "Could not connect Notion.",
    );
  }
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
