// src/index.ts
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { z } from "zod";
function findUp(filename, startDir) {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return void 0;
    dir = parent;
  }
}
var envPath = findUp(".env", process.cwd());
if (envPath) dotenv.config({ path: envPath });
var EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(["development", "test", "production"]).optional()
});
var env = EnvSchema.parse(process.env);
async function main() {
  console.log("[starbeam-worker] boot", {
    nodeEnv: env.NODE_ENV ?? "development",
    hasDatabaseUrl: Boolean(env.DATABASE_URL)
  });
}
main().catch((err) => {
  console.error("[starbeam-worker] fatal", err);
  process.exitCode = 1;
});
//# sourceMappingURL=index.js.map