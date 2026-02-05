import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

function runEvalInWebApp(env: NodeJS.ProcessEnv) {
  const webRoot = fileURLToPath(new URL("..", import.meta.url));

  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        "import mod from './src/lib/auth.ts'; console.log(String(mod.authOptions.providers.length));",
      ],
      {
        cwd: webRoot,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

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
    child.on("error", (err) =>
      resolve({
        code: 1,
        stdout,
        stderr: `${stderr}${stderr ? "\n" : ""}${String(err)}`,
      }),
    );
  });
}

test("authOptions has no providers when Google auth env is not set", async () => {
  const env = { ...process.env };
  // Some tooling (and/or local shells) may load a `.env`. Ensure we explicitly
  // set empty values so dotenv won't override them.
  env.GOOGLE_CLIENT_ID = "";
  env.GOOGLE_CLIENT_SECRET = "";

  const result = await runEvalInWebApp(env);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), "0");
});

test("authOptions includes Google provider when env is set", async () => {
  const env = {
    ...process.env,
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
  };

  const result = await runEvalInWebApp(env);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), "1");
});
