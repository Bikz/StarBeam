"use server";

import { prisma } from "@starbeam/db";
import { makeWorkerUtils, runMigrations } from "graphile-worker";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { enqueueAutoFirstNightlyWorkspaceRun } from "@/lib/nightlyRunQueue";

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export async function runNightlyNow(workspaceSlug: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: true },
  });
  if (!membership) throw new Error("Not a member");
  if (!canManage(membership.role)) throw new Error("Managers/Admins only");

  const existingPulse = await prisma.pulseEdition.findFirst({
    where: { workspaceId: membership.workspace.id, userId: session.user.id },
    select: { id: true },
  });
  const isFirstPulse = !existingPulse;

  if (isFirstPulse) {
    // If the user already has an auto-first run queued (e.g. from connecting
    // integrations), reschedule it to "now" rather than enqueueing duplicates.
    await enqueueAutoFirstNightlyWorkspaceRun({
      workspaceId: membership.workspace.id,
      triggeredByUserId: session.user.id,
      source: "web",
      runAt: new Date(),
      jobKeyMode: "replace",
    });

    redirect(`/w/${workspaceSlug}/jobs?queued=1`);
  }

  const jobRun = await prisma.jobRun.create({
    data: {
      workspaceId: membership.workspace.id,
      kind: "NIGHTLY_WORKSPACE_RUN",
      status: "QUEUED",
      meta: { triggeredByUserId: session.user.id, source: "web" },
    },
  });

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL");

  try {
    // Ensure Graphile Worker schema/tables exist before enqueue (local dev friendliness).
    await runMigrations({ connectionString });

    const workerUtils = await makeWorkerUtils({ connectionString });
    try {
      await workerUtils.addJob(
        "nightly_workspace_run",
        { workspaceId: membership.workspace.id, jobRunId: jobRun.id },
        // Explicitly set runAt "now" so "Run now" never looks like a nightly schedule.
        { jobKey: `nightly_workspace_run:${jobRun.id}`, runAt: new Date() },
      );
    } finally {
      await workerUtils.release();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to enqueue job";
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: { status: "FAILED", finishedAt: new Date(), errorSummary: message },
    });

    throw err;
  }

  redirect(`/w/${workspaceSlug}/jobs?queued=1`);
}
