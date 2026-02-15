import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}\n…(truncated)`;
}

function isTruthyEnv(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes((value ?? "").trim().toLowerCase());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBoundedIntEnv(args: {
  name: string;
  fallback: number;
  min: number;
  max: number;
}): number {
  const raw = (process.env[args.name] ?? "").trim();
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return args.fallback;
  const value = Math.floor(parsed);
  if (value < args.min) return args.min;
  if (value > args.max) return args.max;
  return value;
}

function codexExecMaxAttempts(): number {
  return parseBoundedIntEnv({
    name: "STARB_CODEX_EXEC_MAX_ATTEMPTS",
    fallback: 2,
    min: 1,
    max: 5,
  });
}

function codexExecRetryInitialDelayMs(): number {
  return parseBoundedIntEnv({
    name: "STARB_CODEX_EXEC_RETRY_INITIAL_DELAY_MS",
    fallback: 800,
    min: 100,
    max: 10_000,
  });
}

function isRetryableCodexError(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException;
  const code = typeof e?.code === "string" ? e.code : "";
  if (["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ENETUNREACH"].includes(code)) {
    return true;
  }

  const msg = (e?.message ?? String(err)).toLowerCase();
  return (
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("service unavailable")
  );
}

function isRetryableCodexExit(args: {
  exitCode: number;
  stdout: string;
  stderr: string;
}): boolean {
  if (args.exitCode === 0) return false;
  // Signal-like exits (killed / terminated) are typically transient.
  if (args.exitCode === 137 || args.exitCode === 143) return true;

  const blob = `${args.stderr}\n${args.stdout}`.toLowerCase();
  return (
    blob.includes("timed out") ||
    blob.includes("timeout") ||
    blob.includes("rate limit") ||
    blob.includes("too many requests") ||
    blob.includes("429") ||
    blob.includes("500") ||
    blob.includes("502") ||
    blob.includes("503") ||
    blob.includes("504") ||
    blob.includes("connection reset") ||
    blob.includes("econnreset") ||
    blob.includes("eai_again")
  );
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function findUpDirContainingFile(
  filename: string,
  startDir: string,
): Promise<string | undefined> {
  let dir = startDir;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await pathExists(path.join(dir, filename))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function codexBinNamesForPlatform(): string[] {
  if (process.platform === "win32") return ["codex.cmd", "codex.exe", "codex"];
  return ["codex"];
}

async function resolveCodexExecutable(): Promise<string> {
  const override = (process.env.STARB_CODEX_BIN ?? "").trim();
  if (override) return override;

  const binNames = codexBinNamesForPlatform();

  // Prefer the package-local binary for the running worker package, then fall
  // back to the repo root, then finally PATH.
  const fileDir = path.dirname(fileURLToPath(import.meta.url));
  const workerRoot =
    (await findUpDirContainingFile("package.json", fileDir)) ?? process.cwd();
  const repoRoot =
    (await findUpDirContainingFile("pnpm-workspace.yaml", workerRoot)) ??
    workerRoot;

  const candidates: string[] = [];
  for (const name of binNames) {
    candidates.push(path.join(workerRoot, "node_modules", ".bin", name));
  }
  for (const name of binNames) {
    candidates.push(path.join(repoRoot, "node_modules", ".bin", name));
  }

  for (const c of candidates) {
    if (await pathExists(c)) return c;
  }

  return "codex";
}

async function makeEphemeralHome(): Promise<{
  dir: string;
  env: NodeJS.ProcessEnv;
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "starbeam-codex-home-"));
  const xdgConfig = path.join(dir, ".config");
  const xdgState = path.join(dir, ".local", "state");
  const xdgCache = path.join(dir, ".cache");

  await Promise.all([
    fs.mkdir(xdgConfig, { recursive: true }),
    fs.mkdir(xdgState, { recursive: true }),
    fs.mkdir(xdgCache, { recursive: true }),
  ]);

  const codexHome = path.join(dir, ".codex");
  await fs.mkdir(codexHome, { recursive: true });

  const codexApiKey =
    (process.env.CODEX_API_KEY ?? "").trim() ||
    (process.env.OPENAI_API_KEY ?? "").trim();

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CI: "1",
    HOME: dir,
    XDG_CONFIG_HOME: xdgConfig,
    XDG_STATE_HOME: xdgState,
    XDG_CACHE_HOME: xdgCache,
    // Codex stores local state under CODEX_HOME (defaults to ~/.codex).
    // In the worker we always use an ephemeral home dir to avoid persisting
    // rollout files, logs, or auth state between runs.
    CODEX_HOME: codexHome,
    ...(codexApiKey ? { CODEX_API_KEY: codexApiKey } : {}),
  };

  return { dir, env };
}

type CodexDetectResult = {
  ok: boolean;
  resolvedCommand: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  spawnErrorCode?: string;
  spawnErrorMessage?: string;
};

export async function isCodexInstalled(): Promise<CodexDetectResult> {
  const { dir: homeDir, env } = await makeEphemeralHome();
  try {
    const resolvedCommand = await resolveCodexExecutable();

    const { exitCode, stdout, stderr, spawnErrorCode, spawnErrorMessage } =
      await new Promise<{
        exitCode: number | null;
        stdout: string;
        stderr: string;
        spawnErrorCode?: string;
        spawnErrorMessage?: string;
      }>((resolve) => {
        const proc = spawn(resolvedCommand, ["--version"], {
          stdio: ["ignore", "pipe", "pipe"],
          env,
        });

        let stdout = "";
        let stderr = "";

        proc.stdout.setEncoding("utf8");
        proc.stderr.setEncoding("utf8");

        proc.stdout.on("data", (d: string) => {
          stdout += d;
          if (stdout.length > 32_000) stdout = truncate(stdout, 32_000);
        });
        proc.stderr.on("data", (d: string) => {
          stderr += d;
          if (stderr.length > 32_000) stderr = truncate(stderr, 32_000);
        });

        proc.on("error", (err) => {
          const code =
            typeof (err as NodeJS.ErrnoException).code === "string"
              ? String((err as NodeJS.ErrnoException).code)
              : undefined;
          resolve({
            exitCode: null,
            stdout,
            stderr: stderr || String(err),
            ...(code ? { spawnErrorCode: code } : {}),
            spawnErrorMessage: err.message,
          });
        });

        proc.on("close", (code) =>
          resolve({
            exitCode: typeof code === "number" ? code : null,
            stdout,
            stderr,
          }),
        );
      });

    return {
      ok: exitCode === 0,
      resolvedCommand,
      exitCode,
      stdout,
      stderr,
      ...(spawnErrorCode ? { spawnErrorCode } : {}),
      ...(spawnErrorMessage ? { spawnErrorMessage } : {}),
    };
  } finally {
    await fs
      .rm(homeDir, { recursive: true, force: true })
      .catch(() => undefined);
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
  jsonEvents?: boolean;
}): Promise<{
  exitCode: number;
  attemptCount: number;
  stdout: string;
  stderr: string;
  resolvedCommand: string;
  argv: string[];
  usage?: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
  };
}> {
  const { dir: homeDir, env } = await makeEphemeralHome();

  try {
    const resolvedCommand = await resolveCodexExecutable();
    const jsonEvents =
      typeof args.jsonEvents === "boolean"
        ? args.jsonEvents
        : isTruthyEnv(process.env.STARB_CODEX_JSON_EVENTS);

    const argv = [
      // Non-interactive worker job: never ask for approvals.
      "-a",
      "never",
      ...(args.reasoningEffort
        ? ["-c", `model_reasoning_effort=${args.reasoningEffort}`]
        : []),
      ...(args.enableWebSearch ? ["--search"] : []),
      "exec",
      // Keep Codex state entirely ephemeral; we rely on -o output file for results.
      "--ephemeral",
      ...(jsonEvents ? ["--json"] : []),
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

    const maxAttempts = codexExecMaxAttempts();
    const retryInitialDelayMs = codexExecRetryInitialDelayMs();

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const single = await runCodexExecAttempt({
          resolvedCommand,
          argv,
          env,
          prompt: args.prompt,
          timeoutMs: args.timeoutMs,
          jsonEvents,
        });

        if (
          attempt < maxAttempts &&
          isRetryableCodexExit({
            exitCode: single.exitCode,
            stdout: single.stdout,
            stderr: single.stderr,
          })
        ) {
          await sleep(retryInitialDelayMs * 2 ** (attempt - 1));
          continue;
        }

        return {
          ...single,
          attemptCount: attempt,
          resolvedCommand,
          argv,
        };
      } catch (err) {
        if (attempt < maxAttempts && isRetryableCodexError(err)) {
          await sleep(retryInitialDelayMs * 2 ** (attempt - 1));
          continue;
        }
        throw err;
      }
    }

    // Loop always returns or throws, this is only a type guard fallback.
    throw new Error("Unexpected codex exec retry state");
  } finally {
    await fs
      .rm(homeDir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}

async function runCodexExecAttempt(args: {
  resolvedCommand: string;
  argv: string[];
  env: NodeJS.ProcessEnv;
  prompt: string;
  timeoutMs?: number;
  jsonEvents: boolean;
}): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  usage?: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
  };
}> {
  const proc = spawn(args.resolvedCommand, args.argv, {
    stdio: ["pipe", "pipe", "pipe"],
    env: args.env,
  });

  let stdout = "";
  let stderr = "";

  let stdoutLineBuf = "";
  let usage:
    | { inputTokens: number; cachedInputTokens: number; outputTokens: number }
    | undefined;

  proc.stdout.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");

  proc.stdout.on("data", (d: string) => {
    if (args.jsonEvents) {
      stdoutLineBuf += d;

      // Parse newline-delimited JSON events. Keep a small tail of stdout for
      // debugging, but avoid storing the entire event stream.
      if (stdout.length < 128_000) {
        stdout += d;
        if (stdout.length > 128_000) stdout = truncate(stdout, 128_000);
      }

      while (true) {
        const idx = stdoutLineBuf.indexOf("\n");
        if (idx < 0) break;
        const line = stdoutLineBuf.slice(0, idx).trim();
        stdoutLineBuf = stdoutLineBuf.slice(idx + 1);
        if (!line) continue;
        try {
          const evt = JSON.parse(line) as {
            type?: unknown;
            usage?: unknown;
          };
          if (evt.type !== "turn.completed") continue;
          const u = evt.usage as
            | {
                input_tokens?: unknown;
                cached_input_tokens?: unknown;
                output_tokens?: unknown;
              }
            | undefined;
          if (!u || typeof u !== "object") continue;

          const input = typeof u.input_tokens === "number" ? u.input_tokens : 0;
          const cached =
            typeof u.cached_input_tokens === "number"
              ? u.cached_input_tokens
              : 0;
          const out = typeof u.output_tokens === "number" ? u.output_tokens : 0;

          usage = usage
            ? {
                inputTokens: usage.inputTokens + input,
                cachedInputTokens: usage.cachedInputTokens + cached,
                outputTokens: usage.outputTokens + out,
              }
            : {
                inputTokens: input,
                cachedInputTokens: cached,
                outputTokens: out,
              };
        } catch {
          // Ignore malformed lines; keep running.
        }
      }
      return;
    }

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
    const timeoutMs =
      typeof args.timeoutMs === "number" ? args.timeoutMs : 4 * 60 * 1000;
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

  return {
    exitCode,
    stdout,
    stderr,
    ...(usage ? { usage } : {}),
  };
}
