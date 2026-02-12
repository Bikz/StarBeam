"use server";

import { prisma } from "@starbeam/db";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import {
  enqueueAutoFirstNightlyWorkspaceRun,
  enqueueWorkspaceBootstrap,
} from "@/lib/nightlyRunQueue";
import { consumeRateLimit } from "@/lib/rateLimit";
import { requestIdFromHeaders } from "@/lib/requestId";

export async function generateFirstPulseNow(workspaceSlug: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: true },
  });
  if (!membership) throw new Error("Not a member");

  const existingPulse = await prisma.pulseEdition.findFirst({
    where: { workspaceId: membership.workspace.id, userId: session.user.id },
    select: { id: true },
  });
  if (existingPulse) {
    redirect(`/w/${workspaceSlug}/pulse`);
  }

  // Basic abuse/cost controls (DB-backed, works across multiple instances).
  await consumeRateLimit({
    key: `run_now:user:${session.user.id}`,
    windowSec: 60,
    limit: Number(process.env.STARB_RUN_NOW_USER_LIMIT_1M ?? "3") || 3,
  });
  await consumeRateLimit({
    key: `run_now:workspace:${membership.workspace.id}`,
    windowSec: 60,
    limit: Number(process.env.STARB_RUN_NOW_WORKSPACE_LIMIT_1M ?? "5") || 5,
  });
  await consumeRateLimit({
    key: `run_day:workspace:${membership.workspace.id}`,
    windowSec: 24 * 60 * 60,
    limit: Number(process.env.STARB_RUN_WORKSPACE_LIMIT_1D ?? "20") || 20,
  });

  const runAt = new Date();

  const headerStore = await headers();
  const requestId = requestIdFromHeaders(headerStore) ?? undefined;

  await enqueueWorkspaceBootstrap({
    workspaceId: membership.workspace.id,
    userId: session.user.id,
    triggeredByUserId: session.user.id,
    source: "web",
    runAt,
    jobKeyMode: "replace",
    requestId,
  });

  await enqueueAutoFirstNightlyWorkspaceRun({
    workspaceId: membership.workspace.id,
    userId: session.user.id,
    triggeredByUserId: session.user.id,
    source: "web",
    runAt,
    jobKeyMode: "replace",
    requestId,
  });

  redirect(`/w/${workspaceSlug}/pulse?queued=1`);
}
