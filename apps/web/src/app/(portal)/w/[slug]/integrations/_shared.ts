import { prisma } from "@starbeam/db";
import { encryptString, parseAes256GcmKeyFromEnv } from "@starbeam/shared";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import {
  enqueueAutoFirstNightlyWorkspaceRun,
  enqueueWorkspaceBootstrap,
} from "@/lib/nightlyRunQueue";

export async function requireMembership(workspaceSlug: string): Promise<{
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

export function encryptSecret(secret: string): string {
  return encryptString(secret, encKey());
}

export function normalizeSecret(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function scheduleAutoFirstPulseIfNeeded(args: {
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  role: string;
}): Promise<void> {
  const existingPulse = await prisma.pulseEdition.findFirst({
    where: { workspaceId: args.workspaceId, userId: args.userId },
    select: { id: true },
  });
  if (existingPulse) return;

  try {
    await enqueueWorkspaceBootstrap({
      workspaceId: args.workspaceId,
      userId: args.userId,
      triggeredByUserId: args.userId,
      source: "auto-first",
      runAt: new Date(),
      jobKeyMode: "replace",
    });

    await enqueueAutoFirstNightlyWorkspaceRun({
      workspaceId: args.workspaceId,
      userId: args.userId,
      triggeredByUserId: args.userId,
      source: "auto-first",
      runAt: new Date(Date.now() + 10 * 60 * 1000),
      jobKeyMode: "preserve_run_at",
    });
  } catch {
    // Don't block the integration connect flow on the job queue.
  }
}

export async function fetchGitHubViewer(
  token: string,
): Promise<{ login: string }> {
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

export async function fetchLinearViewer(token: string): Promise<{
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

  const id =
    typeof parsed.data?.viewer?.id === "string" ? parsed.data.viewer.id : "";
  const email =
    typeof parsed.data?.viewer?.email === "string"
      ? parsed.data.viewer.email
      : undefined;

  if (!id) throw new Error("Linear auth failed (missing viewer.id).");
  return { id, email };
}

export async function fetchNotionBot(token: string): Promise<{
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
