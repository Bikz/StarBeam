import { prisma } from "@starbeam/db";
import { makeWorkerUtils, runMigrations } from "graphile-worker";

function requireDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL");
  return connectionString;
}

function autoFirstNightlyJobKey(workspaceId: string): string {
  return `nightly_workspace_run:auto-first:${workspaceId}`;
}

function autoFirstNightlyJobRunId(workspaceId: string): string {
  return `auto-first:${workspaceId}`;
}

function workspaceBootstrapJobKey(workspaceId: string): string {
  return `workspace_bootstrap:${workspaceId}`;
}

function workspaceBootstrapJobRunId(workspaceId: string): string {
  return `bootstrap:${workspaceId}`;
}

export async function enqueueAutoFirstNightlyWorkspaceRun(args: {
  workspaceId: string;
  triggeredByUserId: string;
  source: "auto-first" | "web";
  runAt: Date;
  jobKeyMode: "replace" | "preserve_run_at" | "unsafe_dedupe";
}): Promise<void> {
  const jobKey = autoFirstNightlyJobKey(args.workspaceId);
  const jobRunId = autoFirstNightlyJobRunId(args.workspaceId);

  await prisma.jobRun.upsert({
    where: { id: jobRunId },
    update: {
      workspaceId: args.workspaceId,
      kind: "NIGHTLY_WORKSPACE_RUN",
      status: "QUEUED",
      startedAt: null,
      finishedAt: null,
      errorSummary: null,
      meta: { triggeredByUserId: args.triggeredByUserId, source: args.source, jobKey },
    },
    create: {
      id: jobRunId,
      workspaceId: args.workspaceId,
      kind: "NIGHTLY_WORKSPACE_RUN",
      status: "QUEUED",
      meta: { triggeredByUserId: args.triggeredByUserId, source: args.source, jobKey },
    },
  });

  const connectionString = requireDatabaseUrl();

  // Ensure Graphile Worker schema/tables exist before enqueue (local dev friendliness).
  await runMigrations({ connectionString });

  const workerUtils = await makeWorkerUtils({ connectionString });
  try {
    await workerUtils.addJob(
      "nightly_workspace_run",
      { workspaceId: args.workspaceId, jobRunId },
      { jobKey, jobKeyMode: args.jobKeyMode, runAt: args.runAt },
    );
  } finally {
    await workerUtils.release();
  }
}

export async function enqueueWorkspaceBootstrap(args: {
  workspaceId: string;
  triggeredByUserId: string;
  source: "auto-first" | "web";
  runAt: Date;
  jobKeyMode: "replace" | "preserve_run_at" | "unsafe_dedupe";
}): Promise<void> {
  const jobKey = workspaceBootstrapJobKey(args.workspaceId);
  const jobRunId = workspaceBootstrapJobRunId(args.workspaceId);

  await prisma.jobRun.upsert({
    where: { id: jobRunId },
    update: {
      workspaceId: args.workspaceId,
      kind: "WORKSPACE_BOOTSTRAP",
      status: "QUEUED",
      startedAt: null,
      finishedAt: null,
      errorSummary: null,
      meta: { triggeredByUserId: args.triggeredByUserId, source: args.source, jobKey },
    },
    create: {
      id: jobRunId,
      workspaceId: args.workspaceId,
      kind: "WORKSPACE_BOOTSTRAP",
      status: "QUEUED",
      meta: { triggeredByUserId: args.triggeredByUserId, source: args.source, jobKey },
    },
  });

  const connectionString = requireDatabaseUrl();

  await runMigrations({ connectionString });

  const workerUtils = await makeWorkerUtils({ connectionString });
  try {
    await workerUtils.addJob(
      "workspace_bootstrap",
      { workspaceId: args.workspaceId, jobRunId },
      { jobKey, jobKeyMode: args.jobKeyMode, runAt: args.runAt },
    );
  } finally {
    await workerUtils.release();
  }
}
