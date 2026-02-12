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
import { fetchLinearViewer } from "@/app/(portal)/w/[slug]/integrations/providerCheck";
import { friendlyProviderError } from "@/app/(portal)/w/[slug]/integrations/providerErrors";

export async function connectLinearAction(
  workspaceSlug: string,
  _prev: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const { userId, role, workspace } = await requireMembership(workspaceSlug);
  const token = normalizeSecret(formData.get("token"));
  if (!token) {
    return {
      ok: false,
      fieldErrors: { token: "Paste an API key to continue." },
    };
  }

  const viewer = await fetchLinearViewer(token);
  if (!viewer.ok) {
    return { ok: false, message: friendlyProviderError("linear", viewer) };
  }

  const tokenEnc = encryptSecret(token);

  await prisma.linearConnection.upsert({
    where: {
      workspaceId_ownerUserId_linearUserId: {
        workspaceId: workspace.id,
        ownerUserId: userId,
        linearUserId: viewer.value.id,
      },
    },
    update: {
      tokenEnc,
      linearUserEmail: viewer.value.email ?? null,
      status: "CONNECTED",
    },
    create: {
      workspaceId: workspace.id,
      ownerUserId: userId,
      linearUserId: viewer.value.id,
      linearUserEmail: viewer.value.email ?? null,
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

export async function connectLinear(workspaceSlug: string, formData: FormData) {
  // Backwards-compatible wrapper; prefer connectLinearAction for inline errors.
  const res = await connectLinearAction(workspaceSlug, { ok: true }, formData);
  if (!res.ok) {
    throw new Error(
      res.fieldErrors?.token ?? res.message ?? "Could not connect Linear.",
    );
  }
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
