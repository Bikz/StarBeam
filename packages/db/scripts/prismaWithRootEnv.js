import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const args = process.argv.slice(2);
if (args.length === 0) {
  // eslint-disable-next-line no-console
  console.error("Usage: node scripts/prismaWithRootEnv.js <prisma-args...>");
  process.exit(1);
}

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpmBin, ["exec", "prisma", ...args], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
