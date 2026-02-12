import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import { run, runMigrations, type Task, type TaskList } from "graphile-worker";
import { z } from "zod";

import {
  isBlobStoreConfigured,
  verifyBlobStoreRwDelete,
} from "./lib/blobStore";
import { captureTaskError, initSentry } from "./lib/sentry";
import * as tasks from "./tasks";

function isTruthyEnv(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes((value ?? "").trim().toLowerCase());
}

function pollIntervalMinsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.STARB_CONNECTOR_POLL_INTERVAL_MINS ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 240) return Math.floor(n);
  return 15;
}

function connectorPollCrontab(env: NodeJS.ProcessEnv = process.env): string {
  // We schedule a fairly frequent tick and let the poll task enforce its own
  // cutoff. This keeps scheduling robust even if the interval isn't a divisor
  // of 60 minutes, and prevents "no poll running" if the worker restarts.
  const enabled = isTruthyEnv(env.STARB_CONNECTOR_POLL_ENABLED ?? "1");
  if (!enabled) return "\n";

  // Tick every 5 minutes; the task uses STARB_CONNECTOR_POLL_INTERVAL_MINS to
  // decide whether a given connector actually needs syncing.
  return "*/5 * * * * connector_poll\n";
}

function dailyPulseCrontab(env: NodeJS.ProcessEnv = process.env): string {
  const enabled = isTruthyEnv(env.STARB_DAILY_PULSE_ENABLED ?? "1");
  if (!enabled) return "\n";
  return "*/15 * * * * enqueue_due_daily_pulses\n";
}

function blobGcCrontab(env: NodeJS.ProcessEnv = process.env): string {
  const enabled = isTruthyEnv(env.STARB_BLOB_GC_ENABLED ?? "1");
  if (!enabled) return "\n";
  // Daily at 06:20 UTC (chosen to avoid running at the top of the hour).
  return "20 6 * * * blob_gc\n";
}

function dbHygieneGcCrontab(env: NodeJS.ProcessEnv = process.env): string {
  const enabled = isTruthyEnv(env.STARB_DB_GC_ENABLED ?? "1");
  if (!enabled) return "\n";
  // Daily at 06:35 UTC (chosen to avoid running at the top of the hour).
  return "35 6 * * * db_hygiene_gc\n";
}

function makeCrontab(env: NodeJS.ProcessEnv = process.env): string {
  return [
    connectorPollCrontab(env),
    dailyPulseCrontab(env),
    blobGcCrontab(env),
    dbHygieneGcCrontab(env),
  ].join("");
}

function findUp(filename: string, startDir: string): string | undefined {
  let dir = startDir;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

// Load a repo-root `.env` if present (useful in local dev); production should
// provide env vars via the host. Skip in tests to avoid leaking local env
// into deterministic unit tests.
if (process.env.NODE_ENV !== "test") {
  const envPath = findUp(".env", process.cwd());
  if (envPath) dotenv.config({ path: envPath });
}

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  WORKER_CONCURRENCY: z.string().optional(),
  WORKER_MODE: z.enum(["run", "check"]).optional(),
});

const env = EnvSchema.parse(process.env);

async function main() {
  initSentry();

  const concurrency = env.WORKER_CONCURRENCY
    ? Number(env.WORKER_CONCURRENCY)
    : 5;

  const connectorPollEnabled = isTruthyEnv(
    process.env.STARB_CONNECTOR_POLL_ENABLED ?? "1",
  );
  const connectorPollIntervalMins = pollIntervalMinsFromEnv();
  const codexExecEnabled = isTruthyEnv(process.env.STARB_CODEX_EXEC_ENABLED);
  const codexApiKeyPresent = Boolean(
    (process.env.CODEX_API_KEY ?? process.env.OPENAI_API_KEY ?? "").trim(),
  );
  const blobStoreConfigured = isBlobStoreConfigured();
  const blobVerifyEnabled =
    process.env.STARB_BLOB_STORE_VERIFY_ON_BOOT === undefined
      ? (env.NODE_ENV ?? "development") === "production"
      : isTruthyEnv(process.env.STARB_BLOB_STORE_VERIFY_ON_BOOT);

  // eslint-disable-next-line no-console
  console.log("[starbeam-worker] boot", {
    nodeEnv: env.NODE_ENV ?? "development",
    hasDatabaseUrl: Boolean(env.DATABASE_URL),
    concurrency,
    mode: env.WORKER_MODE ?? "run",
    connectorPoll: {
      enabled: connectorPollEnabled,
      intervalMins: connectorPollIntervalMins,
      tickMins: 5,
    },
    codex: {
      execEnabled: codexExecEnabled,
      hasCodexKey: codexApiKeyPresent,
      hasBlobStore: blobStoreConfigured,
    },
    blobStore: { verifyOnBoot: blobVerifyEnabled },
  });

  // In "check" mode, we still validate hosted invariants (R2/Codex checks) and
  // exit before running migrations + the worker loop.

  // Hosted hardening: if we're going to run Codex exec (which relies on
  // materialized contexts and (often) encrypted blobs), fail fast if R2/S3
  // isn't configured. In local dev, warn instead to keep the UX flexible.
  if (codexExecEnabled && codexApiKeyPresent && !blobStoreConfigured) {
    const msg =
      "[starbeam-worker] fatal: STARB_CODEX_EXEC_ENABLED=1 but S3/R2 env vars are missing (S3_ENDPOINT/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY/S3_BUCKET).";
    if ((env.NODE_ENV ?? "development") === "production") {
      // eslint-disable-next-line no-console
      console.error(msg);
      process.exitCode = 1;
      return;
    }
    // eslint-disable-next-line no-console
    console.warn(msg);
  }

  if (blobStoreConfigured && blobVerifyEnabled) {
    try {
      await verifyBlobStoreRwDelete();
      // eslint-disable-next-line no-console
      console.log("[starbeam-worker] blob store verification ok");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const msg = `[starbeam-worker] blob store verification failed: ${message}`;
      if ((env.NODE_ENV ?? "development") === "production") {
        // eslint-disable-next-line no-console
        console.error(msg);
        process.exitCode = 1;
        return;
      }
      // eslint-disable-next-line no-console
      console.warn(msg);
    }
  }

  if (env.WORKER_MODE === "check") return;

  // Ensure Graphile Worker schema/tables exist. This is idempotent and safe to
  // run on startup.
  await runMigrations({ connectionString: env.DATABASE_URL });

  // Wrap tasks so thrown errors are reported to Sentry (when enabled) with
  // task name + payload metadata.
  const taskList: TaskList = Object.fromEntries(
    Object.entries(tasks).map(([name, fn]) => {
      if (typeof fn !== "function") return [name, fn] as const;

      const wrapped: Task = async (payload, helpers) => {
        try {
          // Most tasks in this repo accept only `payload`. Forward `helpers`
          // anyway so tasks can opt into it later without refactors.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          await (fn as (p: unknown, h: unknown) => unknown)(payload, helpers);
          return;
        } catch (err) {
          const payloadObj =
            payload && typeof payload === "object"
              ? (payload as Record<string, unknown>)
              : null;
          const workspaceId =
            payloadObj && typeof payloadObj.workspaceId === "string"
              ? payloadObj.workspaceId
              : undefined;
          const jobRunId =
            payloadObj && typeof payloadObj.jobRunId === "string"
              ? payloadObj.jobRunId
              : undefined;
          const requestId =
            payloadObj && typeof payloadObj.requestId === "string"
              ? payloadObj.requestId
              : undefined;

          const job =
            helpers && typeof helpers === "object" && "job" in helpers
              ? (helpers as { job?: unknown }).job
              : null;
          const jobObj =
            job && typeof job === "object"
              ? (job as Record<string, unknown>)
              : null;
          const jobId = jobObj?.id;
          const attempt =
            typeof jobObj?.attempts === "number"
              ? jobObj.attempts
              : typeof jobObj?.attempt === "number"
                ? jobObj.attempt
                : undefined;
          const maxAttempts =
            typeof jobObj?.max_attempts === "number"
              ? jobObj.max_attempts
              : typeof jobObj?.maxAttempts === "number"
                ? jobObj.maxAttempts
                : undefined;

          const tags: Record<string, string> = {};
          if (workspaceId) tags.workspaceId = workspaceId;
          if (jobRunId) tags.jobRunId = jobRunId;
          if (requestId) tags.requestId = requestId;

          captureTaskError({
            task: name,
            error: err,
            payload,
            job: {
              id:
                typeof jobId === "string" || typeof jobId === "number"
                  ? jobId
                  : undefined,
              attempt,
              maxAttempts,
            },
            tags,
          });
          throw err;
        }
      };

      return [name, wrapped] as const;
    }),
  ) as TaskList;

  await run({
    connectionString: env.DATABASE_URL,
    concurrency,
    // Graphile Worker task map.
    taskList,
    // Avoid relying on a checked-in crontab file; define the schedules in-code.
    crontab: makeCrontab(),
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[starbeam-worker] fatal", err);
  process.exitCode = 1;
});
