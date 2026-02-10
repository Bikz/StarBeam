import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load repo-root env files so prisma commands work when invoked from this
// workspace directory (local dev and CI).
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

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
