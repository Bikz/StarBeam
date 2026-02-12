import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function isTruthyEnv(value) {
  return ["1", "true", "yes"].includes((value ?? "").trim().toLowerCase());
}

function isLocalDatabaseHost(hostname) {
  const host = (hostname ?? "").trim().toLowerCase();
  if (!host) return false;
  if (host === "localhost" || host === "::1") return true;
  if (host === "host.docker.internal") return true;
  if (host.endsWith(".localhost")) return true;
  if (host === "postgres" || host === "db") return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

function isLocalDatabaseUrl(databaseUrl) {
  const raw = (databaseUrl ?? "").trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return isLocalDatabaseHost(parsed.hostname);
  } catch {
    return false;
  }
}

function assertSafeDatabaseUrl(databaseUrl) {
  const nodeEnv = (process.env.NODE_ENV ?? "").trim().toLowerCase();
  if (nodeEnv === "production") return;
  if (isTruthyEnv(process.env.STARB_ALLOW_REMOTE_DB)) return;
  if (isLocalDatabaseUrl(databaseUrl)) return;

  // eslint-disable-next-line no-console
  console.error(
    "Refusing to run Prisma against a non-local DATABASE_URL in non-production. Set STARB_ALLOW_REMOTE_DB=1 to override.",
  );
  process.exit(1);
}

function shouldEnforceDatabaseSafety(args) {
  const cmd = (args[0] ?? "").trim().toLowerCase();
  if (!cmd) return false;
  if (cmd === "generate") return false;
  if (cmd === "format") return false;
  if (cmd === "validate") return false;
  if (cmd === "--help" || cmd === "-h") return false;
  if (cmd === "--version" || cmd === "-v") return false;
  return true;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  // eslint-disable-next-line no-console
  console.error("Usage: node scripts/prismaWithRootEnv.js <prisma-args...>");
  process.exit(1);
}

// Load repo-root env files so prisma commands work when invoked from this
// workspace directory (local dev and CI).
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// Keep local dev/CI resilient: when DIRECT_DATABASE_URL isn't set, default it to
// DATABASE_URL so Prisma CLI can still run (generate/validate/etc). Hosted
// environments should set DIRECT_DATABASE_URL explicitly.
if (
  !process.env.DIRECT_DATABASE_URL &&
  (process.env.DATABASE_URL || process.env.STARB_DATABASE_URL)
) {
  process.env.DIRECT_DATABASE_URL =
    process.env.DATABASE_URL ?? process.env.STARB_DATABASE_URL;
}

if (!process.env.DIRECT_DATABASE_URL && !process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.error(
    "Missing DATABASE_URL/DIRECT_DATABASE_URL. Set DIRECT_DATABASE_URL for Prisma CLI operations.",
  );
  process.exit(1);
}

const targetUrl =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL ??
  process.env.STARB_DATABASE_URL;
if (targetUrl && shouldEnforceDatabaseSafety(args))
  assertSafeDatabaseUrl(targetUrl);

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpmBin, ["exec", "prisma", ...args], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
