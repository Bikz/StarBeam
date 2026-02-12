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
