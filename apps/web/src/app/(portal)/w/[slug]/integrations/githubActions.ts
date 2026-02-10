"use server";

import { prisma } from "@starbeam/db";
import { redirect } from "next/navigation";

import {
  encryptSecret,
  fetchGitHubViewer,
  normalizeSecret,
  requireMembership,
  scheduleAutoFirstPulseIfNeeded,
} from "@/app/(portal)/w/[slug]/integrations/_shared";

function normalizeRepoFullNames(value: unknown): string[] {
  const raw = typeof value === "string" ? value : "";
  const parts = raw
    .split(/[\n,]+/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    // Basic GitHub "owner/name" validation. Keep it permissive.
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(p)) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= 50) break;
  }
  return out;
}

export async function connectGitHub(workspaceSlug: string, formData: FormData) {
  const { userId, role, workspace } = await requireMembership(workspaceSlug);
  const token = normalizeSecret(formData.get("token"));
  if (!token) throw new Error("Missing token");

  const viewer = await fetchGitHubViewer(token);
  const tokenEnc = encryptSecret(token);

  const modeRaw =
    typeof formData.get("mode") === "string"
      ? String(formData.get("mode"))
      : "";
  const mode = modeRaw === "ALL" ? "ALL" : "SELECTED";
  const selectedRepoFullNames =
    mode === "SELECTED" ? normalizeRepoFullNames(formData.get("repos")) : [];

  await prisma.gitHubConnection.upsert({
    where: {
      workspaceId_ownerUserId_githubLogin: {
        workspaceId: workspace.id,
        ownerUserId: userId,
        githubLogin: viewer.login,
      },
    },
    update: {
      tokenEnc,
      status: "CONNECTED",
      repoSelectionMode: mode,
      selectedRepoFullNames,
    },
    create: {
      workspaceId: workspace.id,
      ownerUserId: userId,
      githubLogin: viewer.login,
      tokenEnc,
      status: "CONNECTED",
      repoSelectionMode: mode,
      selectedRepoFullNames,
    },
  });

  if (mode === "ALL" || selectedRepoFullNames.length > 0) {
    await scheduleAutoFirstPulseIfNeeded({
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      userId,
      role,
    });
  }

  redirect(`/w/${workspaceSlug}/integrations?connected=github`);
}

export async function updateGitHubRepoSelection(
  workspaceSlug: string,
  connectionId: string,
  formData: FormData,
) {
  const { userId, role, workspace } = await requireMembership(workspaceSlug);

  const existing = await prisma.gitHubConnection.findFirst({
    where: { id: connectionId, workspaceId: workspace.id, ownerUserId: userId },
    select: { id: true },
  });
  if (!existing) throw new Error("Connection not found");

  const modeRaw =
    typeof formData.get("mode") === "string"
      ? String(formData.get("mode"))
      : "";
  const mode = modeRaw === "SELECTED" ? "SELECTED" : "ALL";
  const selectedRepoFullNames =
    mode === "SELECTED" ? normalizeRepoFullNames(formData.get("repos")) : [];

  await prisma.gitHubConnection.update({
    where: { id: existing.id },
    data: { repoSelectionMode: mode, selectedRepoFullNames },
  });

  if (mode === "ALL" || selectedRepoFullNames.length > 0) {
    await scheduleAutoFirstPulseIfNeeded({
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      userId,
      role,
    });
  }

  redirect(`/w/${workspaceSlug}/integrations?connected=github`);
}

export async function disconnectGitHubConnection(
  workspaceSlug: string,
  connectionId: string,
) {
  const { userId, workspace } = await requireMembership(workspaceSlug);

  const existing = await prisma.gitHubConnection.findFirst({
    where: { id: connectionId, workspaceId: workspace.id, ownerUserId: userId },
    select: { id: true },
  });
  if (!existing) throw new Error("Connection not found");

  await prisma.gitHubConnection.delete({ where: { id: existing.id } });

  // Purge GitHub-derived items for this workspace/user.
  await prisma.sourceItem.deleteMany({
    where: {
      workspaceId: workspace.id,
      ownerUserId: userId,
      type: { in: ["GITHUB_ISSUE", "GITHUB_PULL_REQUEST", "GITHUB_COMMIT"] },
    },
  });

  redirect(`/w/${workspaceSlug}/integrations?disconnected=github`);
}
