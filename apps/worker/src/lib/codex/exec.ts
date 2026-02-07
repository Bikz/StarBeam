import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}\n…(truncated)`;
}

async function makeEphemeralHome(): Promise<{ dir: string; env: NodeJS.ProcessEnv }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "starbeam-codex-home-"));
  const xdgConfig = path.join(dir, ".config");
  const xdgState = path.join(dir, ".local", "state");
  const xdgCache = path.join(dir, ".cache");

  await Promise.all([
    fs.mkdir(xdgConfig, { recursive: true }),
    fs.mkdir(xdgState, { recursive: true }),
    fs.mkdir(xdgCache, { recursive: true }),
  ]);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CI: "1",
    HOME: dir,
    XDG_CONFIG_HOME: xdgConfig,
    XDG_STATE_HOME: xdgState,
    XDG_CACHE_HOME: xdgCache,
  };

  return { dir, env };
}

export async function isCodexInstalled(): Promise<boolean> {
  const { dir: homeDir, env } = await makeEphemeralHome();
  try {
    const exitCode = await new Promise<number>((resolve) => {
      const proc = spawn("codex", ["--version"], {
        stdio: ["ignore", "ignore", "ignore"],
        env,
      });
      proc.on("error", () => resolve(1));
      proc.on("close", (code) => resolve(typeof code === "number" ? code : 1));
    });
    return exitCode === 0;
  } finally {
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function runCodexExec(args: {
  cwd: string;
  prompt: string;
  model?: string;
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  enableWebSearch?: boolean;
  outputSchemaPath: string;
  outputLastMessagePath: string;
  timeoutMs?: number;
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { dir: homeDir, env } = await makeEphemeralHome();

  try {
    const argv = [
      // Non-interactive worker job: never ask for approvals.
      "-a",
      "never",
      ...(args.reasoningEffort ? ["-c", `model_reasoning_effort=${args.reasoningEffort}`] : []),
      ...(args.enableWebSearch ? ["--search"] : []),
      "exec",
      "-C",
      args.cwd,
      "--skip-git-repo-check",
      "-s",
      "read-only",
      "--output-schema",
      args.outputSchemaPath,
      "-o",
      args.outputLastMessagePath,
    ];
    if (args.model) argv.push("-m", args.model);

    // Read the initial prompt from stdin.
    argv.push("-");

    const proc = spawn("codex", argv, {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");

    proc.stdout.on("data", (d: string) => {
      stdout += d;
      if (stdout.length > 512_000) stdout = truncate(stdout, 512_000);
    });
    proc.stderr.on("data", (d: string) => {
      stderr += d;
      if (stderr.length > 512_000) stderr = truncate(stderr, 512_000);
    });

    proc.stdin.write(args.prompt);
    if (!args.prompt.endsWith("\n")) proc.stdin.write("\n");
    proc.stdin.end();

    const exitCode = await new Promise<number>((resolve, reject) => {
      const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : 4 * 60 * 1000;
      const t = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error(`codex exec timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.on("error", (err) => {
        clearTimeout(t);
        reject(err);
      });

      proc.on("close", (code) => {
        clearTimeout(t);
        resolve(typeof code === "number" ? code : 1);
      });
    });

    return { exitCode, stdout, stderr };
  } finally {
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
