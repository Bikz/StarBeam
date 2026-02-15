import { prisma } from "@starbeam/db";
import { makeWorkerUtils } from "graphile-worker";

import { captureTaskError } from "../lib/sentry";

import {
  classifyActivationFailure,
  type ActivationFailureClass,
  summarizeActivationFailureReason,
} from "./activationFailure";

function isTruthy(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(
    (value ?? "").trim().toLowerCase(),
  );
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function requireDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL");
  return connectionString;
}

export function isFirstPulseRetryEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = env.STARB_FIRST_PULSE_AUTO_RETRY_V1;
  if (typeof value === "undefined")
    return (env.NODE_ENV ?? "") !== "production";
  return isTruthy(value);
}

export function parseAutoFirstUserId(args: {
  jobRunId: string;
  meta: unknown;
}): string | null {
  const metaUserId =
    args.meta &&
    typeof args.meta === "object" &&
    "userId" in args.meta &&
    typeof (args.meta as { userId?: unknown }).userId === "string"
      ? String((args.meta as { userId: string }).userId)
      : "";
  if (metaUserId.trim()) return metaUserId.trim();

  const parts = args.jobRunId.split(":");
  // auto-first:<workspaceId>:<userId>
  return parts.length >= 3 && parts[2] ? parts[2] : null;
}

export function shouldRetryFirstPulseFailure(args: {
  failureClass: ActivationFailureClass;
  retryAttempt: number;
  maxAttempts: number;
  hasReadyPulse: boolean;
  hasActiveRetryRun: boolean;
}): boolean {
  if (args.failureClass === "blocking") return false;
  if (args.retryAttempt >= args.maxAttempts) return false;
  if (args.hasReadyPulse) return false;
  if (args.hasActiveRetryRun) return false;
  return true;
}

export async function retry_failed_first_pulses(): Promise<void> {
  if (!isFirstPulseRetryEnabled()) return;

  const now = new Date();
  const windowHours = Math.max(
    1,
    Math.min(72, parseIntEnv("STARB_FIRST_PULSE_RETRY_WINDOW_HOURS", 24)),
  );
  const maxAttempts = Math.max(
    1,
    Math.min(8, parseIntEnv("STARB_FIRST_PULSE_RETRY_MAX_ATTEMPTS", 3)),
  );
  const batchSize = Math.max(
    1,
    Math.min(300, parseIntEnv("STARB_FIRST_PULSE_RETRY_BATCH", 120)),
  );
  const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

  const failedRuns = await prisma.jobRun.findMany({
    where: {
      kind: "NIGHTLY_WORKSPACE_RUN",
      id: { startsWith: "auto-first:" },
      status: { in: ["FAILED", "PARTIAL"] },
      OR: [
        { finishedAt: { gte: windowStart } },
        { finishedAt: null, createdAt: { gte: windowStart } },
      ],
    },
    select: {
      id: true,
      workspaceId: true,
      status: true,
      errorSummary: true,
      meta: true,
      finishedAt: true,
      createdAt: true,
    },
    orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
    take: batchSize,
  });

  if (!failedRuns.length) return;

  const connectionString = requireDatabaseUrl();
  const workerUtils = await makeWorkerUtils({ connectionString });

  const summary = {
    scanned: failedRuns.length,
    queued: 0,
    skippedBlocking: 0,
    skippedAttempts: 0,
    skippedReady: 0,
    skippedActiveRetry: 0,
    skippedMissingUser: 0,
    enqueueErrors: 0,
  };

  try {
    for (const run of failedRuns) {
      const userId = parseAutoFirstUserId({ jobRunId: run.id, meta: run.meta });
      if (!userId) {
        summary.skippedMissingUser += 1;
        continue;
      }

      const metaObj =
        run.meta && typeof run.meta === "object"
          ? (run.meta as Record<string, unknown>)
          : {};
      const retryMeta =
        metaObj.retry &&
        typeof metaObj.retry === "object" &&
        !Array.isArray(metaObj.retry)
          ? (metaObj.retry as Record<string, unknown>)
          : {};
      const retryAttempt =
        typeof retryMeta.attempt === "number" &&
        Number.isFinite(retryMeta.attempt)
          ? Math.max(0, Math.floor(retryMeta.attempt))
          : 0;

      const failureMeta =
        metaObj.activationFailure &&
        typeof metaObj.activationFailure === "object" &&
        !Array.isArray(metaObj.activationFailure)
          ? (metaObj.activationFailure as Record<string, unknown>)
          : {};
      const failureClass: ActivationFailureClass =
        failureMeta.class === "blocking" || failureMeta.class === "retriable"
          ? failureMeta.class
          : classifyActivationFailure(run.errorSummary);
      const failureReason =
        typeof failureMeta.reason === "string" && failureMeta.reason.trim()
          ? failureMeta.reason.trim()
          : summarizeActivationFailureReason(run.errorSummary);

      const retryRunId = `auto-first-retry:${run.workspaceId}:${userId}`;

      const [readyPulse, activeRetryRun] = await Promise.all([
        prisma.pulseEdition.findFirst({
          where: {
            workspaceId: run.workspaceId,
            userId,
            status: "READY",
          },
          select: { id: true },
        }),
        prisma.jobRun.findFirst({
          where: {
            id: retryRunId,
            workspaceId: run.workspaceId,
            kind: "NIGHTLY_WORKSPACE_RUN",
            status: { in: ["QUEUED", "RUNNING"] },
          },
          select: { id: true },
        }),
      ]);

      const retryAllowed = shouldRetryFirstPulseFailure({
        failureClass,
        retryAttempt,
        maxAttempts,
        hasReadyPulse: Boolean(readyPulse),
        hasActiveRetryRun: Boolean(activeRetryRun),
      });
      if (!retryAllowed) {
        if (failureClass === "blocking") summary.skippedBlocking += 1;
        else if (retryAttempt >= maxAttempts) summary.skippedAttempts += 1;
        else if (readyPulse) summary.skippedReady += 1;
        else if (activeRetryRun) summary.skippedActiveRetry += 1;
        continue;
      }

      const nextAttempt = retryAttempt + 1;
      const retryJobKey = `nightly_workspace_run:auto-first-retry:${run.workspaceId}:${userId}`;
      const bootstrapRetryRunId = `bootstrap-retry:${run.workspaceId}:${userId}`;
      const bootstrapRetryKey = `workspace_bootstrap:auto-first-retry:${run.workspaceId}:${userId}`;

      try {
        await prisma.jobRun.upsert({
          where: { id: retryRunId },
          update: {
            workspaceId: run.workspaceId,
            kind: "NIGHTLY_WORKSPACE_RUN",
            status: "QUEUED",
            startedAt: null,
            finishedAt: null,
            errorSummary: null,
            meta: {
              ...metaObj,
              source: "auto-first-retry",
              userId,
              jobKey: retryJobKey,
              retry: {
                attempt: nextAttempt,
                maxAttempts,
                retryOfJobRunId: run.id,
                lastFailureClass: failureClass,
                lastFailureReason: failureReason,
              },
            },
          },
          create: {
            id: retryRunId,
            workspaceId: run.workspaceId,
            kind: "NIGHTLY_WORKSPACE_RUN",
            status: "QUEUED",
            meta: {
              source: "auto-first-retry",
              userId,
              jobKey: retryJobKey,
              retry: {
                attempt: nextAttempt,
                maxAttempts,
                retryOfJobRunId: run.id,
                lastFailureClass: failureClass,
                lastFailureReason: failureReason,
              },
            },
          },
        });

        await prisma.jobRun.upsert({
          where: { id: bootstrapRetryRunId },
          update: {
            workspaceId: run.workspaceId,
            kind: "WORKSPACE_BOOTSTRAP",
            status: "QUEUED",
            startedAt: null,
            finishedAt: null,
            errorSummary: null,
            meta: {
              source: "auto-first-retry",
              userId,
              jobKey: bootstrapRetryKey,
              retry: {
                attempt: nextAttempt,
                maxAttempts,
                retryOfJobRunId: run.id,
              },
            },
          },
          create: {
            id: bootstrapRetryRunId,
            workspaceId: run.workspaceId,
            kind: "WORKSPACE_BOOTSTRAP",
            status: "QUEUED",
            meta: {
              source: "auto-first-retry",
              userId,
              jobKey: bootstrapRetryKey,
              retry: {
                attempt: nextAttempt,
                maxAttempts,
                retryOfJobRunId: run.id,
              },
            },
          },
        });

        await workerUtils.addJob(
          "workspace_bootstrap",
          { workspaceId: run.workspaceId, jobRunId: bootstrapRetryRunId },
          {
            jobKey: bootstrapRetryKey,
            jobKeyMode: "replace",
            runAt: now,
          },
        );

        await workerUtils.addJob(
          "nightly_workspace_run",
          {
            workspaceId: run.workspaceId,
            userId,
            jobRunId: retryRunId,
          },
          {
            jobKey: retryJobKey,
            jobKeyMode: "replace",
            runAt: now,
          },
        );

        summary.queued += 1;
      } catch (err) {
        summary.enqueueErrors += 1;
        captureTaskError({
          task: "retry_failed_first_pulses",
          error: err,
          payload: {
            failedJobRunId: run.id,
            workspaceId: run.workspaceId,
            userId,
            failureClass,
            retryAttempt: nextAttempt,
          },
          tags: {
            workspaceId: run.workspaceId,
            userId,
            failureClass,
            retryAttempt: String(nextAttempt),
          },
        });
      }
    }
  } finally {
    await workerUtils.release();
  }

  // eslint-disable-next-line no-console
  console.log("[retry_failed_first_pulses]", summary);
}
