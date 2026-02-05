import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import { run, runMigrations } from "graphile-worker";
import { z } from "zod";

import * as tasks from "./tasks";

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
// provide env vars via the host.
const envPath = findUp(".env", process.cwd());
if (envPath) dotenv.config({ path: envPath });

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  WORKER_CONCURRENCY: z.string().optional(),
});

const env = EnvSchema.parse(process.env);

async function main() {
  const concurrency = env.WORKER_CONCURRENCY
    ? Number(env.WORKER_CONCURRENCY)
    : 5;

  // eslint-disable-next-line no-console
  console.log("[starbeam-worker] boot", {
    nodeEnv: env.NODE_ENV ?? "development",
    hasDatabaseUrl: Boolean(env.DATABASE_URL),
    concurrency,
  });

  // Ensure Graphile Worker schema/tables exist. This is idempotent and safe to
  // run on startup.
  await runMigrations({ connectionString: env.DATABASE_URL });

  await run({
    connectionString: env.DATABASE_URL,
    concurrency,
    taskList: tasks,
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[starbeam-worker] fatal", err);
  process.exitCode = 1;
});
