"use server";

import crypto from "node:crypto";

import { prisma } from "@starbeam/db";
import { encryptString, parseAes256GcmKeyFromEnv } from "@starbeam/shared";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { enqueueAutoFirstNightlyWorkspaceRun } from "@/lib/nightlyRunQueue";
import { mintSignedState } from "@/lib/signedState";
import { webOrigin } from "@/lib/webOrigin";

function requireGoogleEnv(): { clientId: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("Missing GOOGLE_CLIENT_ID");
  return { clientId };
}

async function requireMembership(workspaceSlug: string): Promise<{
  userId: string;
  role: string;
  workspace: { id: string; slug: string };
}> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: true },
  });
  if (!membership) throw new Error("Not a member");

  return {
    userId: session.user.id,
    role: membership.role,
    workspace: { id: membership.workspace.id, slug: membership.workspace.slug },
  };
}

function encKey(): Buffer {
  return parseAes256GcmKeyFromEnv("STARB_TOKEN_ENC_KEY_B64");
}

function normalizeSecret(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

async function scheduleAutoFirstPulseIfNeeded(args: {
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  role: string;
}) {
  if (!canManage(args.role)) return;

  const existingPulse = await prisma.pulseEdition.findFirst({
    where: { workspaceId: args.workspaceId, userId: args.userId },
    select: { id: true },
  });
  if (existingPulse) return;

  try {
    await enqueueAutoFirstNightlyWorkspaceRun({
      workspaceId: args.workspaceId,
      triggeredByUserId: args.userId,
      source: "auto-first",
      runAt: new Date(Date.now() + 10 * 60 * 1000),
      jobKeyMode: "preserve_run_at",
    });
  } catch {
    // Don't block the integration connect flow on the job queue.
  }
}

async function fetchGitHubViewer(token: string): Promise<{ login: string }> {
  const resp = await fetch("https://api.github.com/user", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  const text = await resp.text();
  if (!resp.ok) throw new Error(`GitHub auth failed (${resp.status}).`);

  const parsed = JSON.parse(text) as { login?: unknown };
  const login = typeof parsed.login === "string" ? parsed.login.trim() : "";
  if (!login) throw new Error("GitHub auth failed (missing login).");
  return { login };
}

async function fetchLinearViewer(token: string): Promise<{
  id: string;
  email?: string;
}> {
  const resp = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: "query { viewer { id email } }",
    }),
    cache: "no-store",
  });

  const text = await resp.text();
  if (!resp.ok) throw new Error(`Linear auth failed (${resp.status}).`);

  const parsed = JSON.parse(text) as {
    data?: { viewer?: { id?: unknown; email?: unknown } };
    errors?: unknown;
  };

  if (Array.isArray(parsed.errors) && parsed.errors.length) {
    throw new Error("Linear auth failed.");
  }

  const id = typeof parsed.data?.viewer?.id === "string" ? parsed.data.viewer.id : "";
  const email =
    typeof parsed.data?.viewer?.email === "string" ? parsed.data.viewer.email : undefined;

  if (!id) throw new Error("Linear auth failed (missing viewer.id).");
  return { id, email };
}

async function fetchNotionBot(token: string): Promise<{
  botId: string;
  workspaceName?: string;
}> {
  const resp = await fetch("https://api.notion.com/v1/users/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
    },
    cache: "no-store",
  });

  const text = await resp.text();
  if (!resp.ok) throw new Error(`Notion auth failed (${resp.status}).`);

  const parsed = JSON.parse(text) as {
    id?: unknown;
    bot?: { workspace_name?: unknown };
  };

  const botId = typeof parsed.id === "string" ? parsed.id : "";
  if (!botId) throw new Error("Notion auth failed (missing bot id).");

  const workspaceName =
    typeof parsed.bot?.workspace_name === "string"
      ? parsed.bot.workspace_name
      : undefined;

  return { botId, workspaceName };
}

export async function startGoogleConnect(workspaceSlug: string) {
  const { userId, workspace } = await requireMembership(workspaceSlug);

  const { clientId } = requireGoogleEnv();
  const origin = webOrigin();
  const redirectUri = `${origin}/api/google/callback`;

  const scopes = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
  ];

  const state = mintSignedState({
    userId,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    nonce: crypto.randomBytes(16).toString("hex"),
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: scopes.join(" "),
    state,
  });

  redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

export async function disconnectGoogleConnection(
  workspaceSlug: string,
  connectionId: string,
) {
  const { userId, workspace } = await requireMembership(workspaceSlug);

  const existing = await prisma.googleConnection.findFirst({
    where: {
      id: connectionId,
      workspaceId: workspace.id,
      ownerUserId: userId,
    },
    select: { id: true },
  });
  if (!existing) throw new Error("Connection not found");

  await prisma.googleConnection.delete({ where: { id: existing.id } });
  redirect(`/w/${workspaceSlug}/integrations?disconnected=google`);
}

export async function connectGitHub(workspaceSlug: string, formData: FormData) {
  const { userId, role, workspace } = await requireMembership(workspaceSlug);
  const token = normalizeSecret(formData.get("token"));
  if (!token) throw new Error("Missing token");

  const viewer = await fetchGitHubViewer(token);
  const tokenEnc = encryptString(token, encKey());

  const modeRaw = typeof formData.get("mode") === "string" ? String(formData.get("mode")) : "";
  const mode = modeRaw === "ALL" ? "ALL" : "SELECTED";
  const selectedRepoFullNames = mode === "SELECTED" ? normalizeRepoFullNames(formData.get("repos")) : [];

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
  redirect(`/w/${workspaceSlug}/integrations?disconnected=github`);
}

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

  const modeRaw = typeof formData.get("mode") === "string" ? String(formData.get("mode")) : "";
  const mode = modeRaw === "SELECTED" ? "SELECTED" : "ALL";
  const selectedRepoFullNames = mode === "SELECTED" ? normalizeRepoFullNames(formData.get("repos")) : [];

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

export async function connectLinear(workspaceSlug: string, formData: FormData) {
  const { userId, role, workspace } = await requireMembership(workspaceSlug);
  const token = normalizeSecret(formData.get("token"));
  if (!token) throw new Error("Missing token");

  const viewer = await fetchLinearViewer(token);
  const tokenEnc = encryptString(token, encKey());

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
  redirect(`/w/${workspaceSlug}/integrations?disconnected=linear`);
}

export async function connectNotion(workspaceSlug: string, formData: FormData) {
  const { userId, role, workspace } = await requireMembership(workspaceSlug);
  const token = normalizeSecret(formData.get("token"));
  if (!token) throw new Error("Missing token");

  const bot = await fetchNotionBot(token);
  const tokenEnc = encryptString(token, encKey());

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
  redirect(`/w/${workspaceSlug}/integrations?disconnected=notion`);
}
