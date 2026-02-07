import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import { run, runMigrations } from "graphile-worker";
import { z } from "zod";

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
  const concurrency = env.WORKER_CONCURRENCY
    ? Number(env.WORKER_CONCURRENCY)
    : 5;

  const connectorPollEnabled = isTruthyEnv(process.env.STARB_CONNECTOR_POLL_ENABLED ?? "1");
  const connectorPollIntervalMins = pollIntervalMinsFromEnv();

  // eslint-disable-next-line no-console
  console.log("[starbeam-worker] boot", {
    nodeEnv: env.NODE_ENV ?? "development",
    hasDatabaseUrl: Boolean(env.DATABASE_URL),
    concurrency,
    mode: env.WORKER_MODE ?? "run",
    connectorPoll: { enabled: connectorPollEnabled, intervalMins: connectorPollIntervalMins, tickMins: 5 },
  });

  if (env.WORKER_MODE === "check") return;

  // Ensure Graphile Worker schema/tables exist. This is idempotent and safe to
  // run on startup.
  await runMigrations({ connectionString: env.DATABASE_URL });

  await run({
    connectionString: env.DATABASE_URL,
    concurrency,
    taskList: tasks,
    // Avoid relying on a checked-in crontab file; define the schedules in-code.
    crontab: connectorPollCrontab(),
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[starbeam-worker] fatal", err);
  process.exitCode = 1;
});
