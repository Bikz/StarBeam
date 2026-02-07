"use server";

import { prisma } from "@starbeam/db";
import { redirect } from "next/navigation";

import {
  encryptSecret,
  fetchLinearViewer,
  normalizeSecret,
  requireMembership,
  scheduleAutoFirstPulseIfNeeded,
} from "@/app/(portal)/w/[slug]/integrations/_shared";

export async function connectLinear(workspaceSlug: string, formData: FormData) {
  const { userId, role, workspace } = await requireMembership(workspaceSlug);
  const token = normalizeSecret(formData.get("token"));
  if (!token) throw new Error("Missing token");

  const viewer = await fetchLinearViewer(token);
  const tokenEnc = encryptSecret(token);

  await prisma.linearConnection.upsert({
    where: {
      workspaceId_ownerUserId_linearUserId: {
        workspaceId: workspace.id,
        ownerUserId: userId,
        linearUserId: viewer.id,
      },
    },
    update: {
      tokenEnc,
      linearUserEmail: viewer.email ?? null,
      status: "CONNECTED",
    },
    create: {
      workspaceId: workspace.id,
      ownerUserId: userId,
      linearUserId: viewer.id,
      linearUserEmail: viewer.email ?? null,
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

  redirect(`/w/${workspaceSlug}/integrations?connected=linear`);
}

export async function disconnectLinearConnection(
  workspaceSlug: string,
  connectionId: string,
) {
  const { userId, workspace } = await requireMembership(workspaceSlug);

  const existing = await prisma.linearConnection.findFirst({
    where: { id: connectionId, workspaceId: workspace.id, ownerUserId: userId },
    select: { id: true },
  });
  if (!existing) throw new Error("Connection not found");

  await prisma.linearConnection.delete({ where: { id: existing.id } });

  await prisma.sourceItem.deleteMany({
    where: {
      workspaceId: workspace.id,
      ownerUserId: userId,
      type: "LINEAR_ISSUE",
    },
  });

  redirect(`/w/${workspaceSlug}/integrations?disconnected=linear`);
}
