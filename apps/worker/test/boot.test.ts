import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

function runNodeScript(
  args: string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string } = {},
) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve) => {
      const child = spawn(process.execPath, args, {
        env: options.env,
        cwd: options.cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });

      child.on("close", (code) => resolve({ code, stdout, stderr }));
    },
  );
}

test("worker exits non-zero without DATABASE_URL", async () => {
  const entry = fileURLToPath(new URL("../src/index.ts", import.meta.url));
  const workerRoot = fileURLToPath(new URL("..", import.meta.url));

  const env = { ...process.env };
  env.NODE_ENV = "test";
  delete env.DATABASE_URL;

  const result = await runNodeScript(["--import", "tsx", entry], {
    env,
    cwd: workerRoot,
  });

  assert.notEqual(result.code, 0);
});

test("worker boots with DATABASE_URL set", async () => {
  const entry = fileURLToPath(new URL("../src/index.ts", import.meta.url));
  const workerRoot = fileURLToPath(new URL("..", import.meta.url));

  const env = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://starbeam:starbeam@localhost:5435/starbeam",
    WORKER_MODE: "check",
  };

  const result = await runNodeScript(["--import", "tsx", entry], {
    env,
    cwd: workerRoot,
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /\[starbeam-worker\] boot/);
  assert.match(result.stdout, /hasDatabaseUrl:\s*true/);
});
