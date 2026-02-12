import { prisma } from "@starbeam/db";
import { makeWorkerUtils, runMigrations } from "graphile-worker";

function requireDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL");
  return connectionString;
}

function autoFirstNightlyJobKey(workspaceId: string, userId: string): string {
  return `nightly_workspace_run:auto-first:${workspaceId}:${userId}`;
}

function autoFirstNightlyJobRunId(workspaceId: string, userId: string): string {
  return `auto-first:${workspaceId}:${userId}`;
}

function workspaceBootstrapJobKey(workspaceId: string, userId: string): string {
  return `workspace_bootstrap:auto-first:${workspaceId}:${userId}`;
}

function workspaceBootstrapJobRunId(
  workspaceId: string,
  userId: string,
): string {
  return `bootstrap:${workspaceId}:${userId}`;
}

export async function enqueueAutoFirstNightlyWorkspaceRun(args: {
  workspaceId: string;
  userId: string;
  triggeredByUserId: string;
  source: "auto-first" | "web";
  runAt: Date;
  jobKeyMode: "replace" | "preserve_run_at" | "unsafe_dedupe";
  requestId?: string;
}): Promise<void> {
  const jobKey = autoFirstNightlyJobKey(args.workspaceId, args.userId);
  const jobRunId = autoFirstNightlyJobRunId(args.workspaceId, args.userId);

  await prisma.jobRun.upsert({
    where: { id: jobRunId },
    update: {
      workspaceId: args.workspaceId,
      kind: "NIGHTLY_WORKSPACE_RUN",
      status: "QUEUED",
      startedAt: null,
      finishedAt: null,
      errorSummary: null,
      meta: {
        triggeredByUserId: args.triggeredByUserId,
        userId: args.userId,
        source: args.source,
        jobKey,
        ...(args.requestId ? { requestId: args.requestId } : {}),
      },
    },
    create: {
      id: jobRunId,
      workspaceId: args.workspaceId,
      kind: "NIGHTLY_WORKSPACE_RUN",
      status: "QUEUED",
      meta: {
        triggeredByUserId: args.triggeredByUserId,
        userId: args.userId,
        source: args.source,
        jobKey,
        ...(args.requestId ? { requestId: args.requestId } : {}),
      },
    },
  });

  const connectionString = requireDatabaseUrl();

  // Ensure Graphile Worker schema/tables exist before enqueue (local dev friendliness).
  await runMigrations({ connectionString });

  const workerUtils = await makeWorkerUtils({ connectionString });
  try {
    await workerUtils.addJob(
      "nightly_workspace_run",
      {
        workspaceId: args.workspaceId,
        userId: args.userId,
        jobRunId,
        ...(args.requestId ? { requestId: args.requestId } : {}),
      },
      { jobKey, jobKeyMode: args.jobKeyMode, runAt: args.runAt },
    );
  } finally {
    await workerUtils.release();
  }
}

export async function enqueueWorkspaceBootstrap(args: {
  workspaceId: string;
  userId: string;
  triggeredByUserId: string;
  source: "auto-first" | "web";
  runAt: Date;
  jobKeyMode: "replace" | "preserve_run_at" | "unsafe_dedupe";
  requestId?: string;
}): Promise<void> {
  const jobKey = workspaceBootstrapJobKey(args.workspaceId, args.userId);
  const jobRunId = workspaceBootstrapJobRunId(args.workspaceId, args.userId);

  await prisma.jobRun.upsert({
    where: { id: jobRunId },
    update: {
      workspaceId: args.workspaceId,
      kind: "WORKSPACE_BOOTSTRAP",
      status: "QUEUED",
      startedAt: null,
      finishedAt: null,
      errorSummary: null,
      meta: {
        triggeredByUserId: args.triggeredByUserId,
        userId: args.userId,
        source: args.source,
        jobKey,
        ...(args.requestId ? { requestId: args.requestId } : {}),
      },
    },
    create: {
      id: jobRunId,
      workspaceId: args.workspaceId,
      kind: "WORKSPACE_BOOTSTRAP",
      status: "QUEUED",
      meta: {
        triggeredByUserId: args.triggeredByUserId,
        userId: args.userId,
        source: args.source,
        jobKey,
        ...(args.requestId ? { requestId: args.requestId } : {}),
      },
    },
  });

  const connectionString = requireDatabaseUrl();

  await runMigrations({ connectionString });

  const workerUtils = await makeWorkerUtils({ connectionString });
  try {
    await workerUtils.addJob(
      "workspace_bootstrap",
      {
        workspaceId: args.workspaceId,
        jobRunId,
        ...(args.requestId ? { requestId: args.requestId } : {}),
      },
      { jobKey, jobKeyMode: args.jobKeyMode, runAt: args.runAt },
    );
  } finally {
    await workerUtils.release();
  }
}
