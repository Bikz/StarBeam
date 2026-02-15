import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCodexExec } from "../src/lib/codex/exec";

async function writeFakeCodexBin(args: { dir: string }) {
  const binDir = path.join(args.dir, "bin");
  await fs.mkdir(binDir, { recursive: true });

  // Use CJS so the script can run standalone without package.json "type": "module".
  const script = `#!/usr/bin/env node
const fs = require("node:fs");

if (!process.env.CODEX_HOME) {
  console.error("expected CODEX_HOME to be set");
  process.exit(2);
}
if (!process.env.CODEX_API_KEY) {
  console.error("expected CODEX_API_KEY to be set");
  process.exit(2);
}

const argv = process.argv.slice(2);
const execIndex = argv.indexOf("exec");
if (execIndex < 0) {
  console.error("expected subcommand 'exec'");
  process.exit(2);
}

const pre = argv.slice(0, execIndex);
const post = argv.slice(execIndex + 1);

const approvalIdx = pre.indexOf("-a");
if (approvalIdx < 0 || pre[approvalIdx + 1] !== "never") {
  console.error("expected '-a never' before 'exec'");
  process.exit(3);
}

const expectSearch = (process.env.FAKE_CODEX_EXPECT_SEARCH ?? "0") === "1";
const preHasSearch = pre.includes("--search");
const postHasSearch = post.includes("--search");
if (postHasSearch) {
  console.error("unexpected '--search' after 'exec'");
  process.exit(4);
}
if (expectSearch && !preHasSearch) {
  console.error("expected '--search' before 'exec'");
  process.exit(5);
}
if (!expectSearch && preHasSearch) {
  console.error("did not expect '--search'");
  process.exit(6);
}

const oIdx = argv.indexOf("-o");
if (oIdx < 0 || !argv[oIdx + 1]) {
  console.error("expected '-o <output>'");
  process.exit(7);
}
const outPath = argv[oIdx + 1];
const flakyStatePath = process.env.FAKE_CODEX_FLAKY_STATE_PATH;
const failFirstRetryable = (process.env.FAKE_CODEX_FAIL_FIRST_RETRYABLE ?? "0") === "1";
if (failFirstRetryable && flakyStatePath) {
  let count = 0;
  try {
    count = Number(fs.readFileSync(flakyStatePath, "utf8") || "0");
  } catch {}
  if (!Number.isFinite(count) || count < 0) count = 0;
  if (count === 0) {
    fs.writeFileSync(flakyStatePath, "1", "utf8");
    console.error("429 rate limit: retry later");
    process.exit(75);
  }
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  // Write a minimal "Codex output" payload for completeness.
  fs.writeFileSync(outPath, JSON.stringify({ cards: [] }), "utf8");
  process.stdout.write("ok\\n");
  process.exit(0);
});
process.stdin.resume();
`;

  const jsPath = path.join(binDir, "codex.js");
  await fs.writeFile(jsPath, script, "utf8");
  await fs.chmod(jsPath, 0o755).catch(() => undefined);

  if (process.platform === "win32") {
    const cmd = '@echo off\r\nnode "%~dp0\\codex.js" %*\r\n';
    await fs.writeFile(path.join(binDir, "codex.cmd"), cmd, "utf8");
  } else {
    await fs.writeFile(path.join(binDir, "codex"), script, "utf8");
    await fs.chmod(path.join(binDir, "codex"), 0o755);
  }

  return { binDir };
}

test("runCodexExec passes approval policy before subcommand (no web search)", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "starbeam-fake-codex-"));
  const oldBin = process.env.STARB_CODEX_BIN;
  const oldOpenaiKey = process.env.OPENAI_API_KEY;

  try {
    const { binDir } = await writeFakeCodexBin({ dir: tmp });
    process.env.STARB_CODEX_BIN =
      process.platform === "win32"
        ? path.join(binDir, "codex.cmd")
        : path.join(binDir, "codex");
    process.env.FAKE_CODEX_EXPECT_SEARCH = "0";
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.STARB_CODEX_JSON_EVENTS;

    const outSchema = path.join(tmp, "schema.json");
    const outMsg = path.join(tmp, "out.json");

    const res = await runCodexExec({
      cwd: tmp,
      prompt: "hello",
      outputSchemaPath: outSchema,
      outputLastMessagePath: outMsg,
      enableWebSearch: false,
      timeoutMs: 10_000,
    });

    assert.equal(res.exitCode, 0);
    assert.match(res.stdout, /ok/);
  } finally {
    if (oldBin === undefined) delete process.env.STARB_CODEX_BIN;
    else process.env.STARB_CODEX_BIN = oldBin;
    if (oldOpenaiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldOpenaiKey;
    delete process.env.FAKE_CODEX_EXPECT_SEARCH;
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("runCodexExec retries transient non-zero exit once and succeeds", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "starbeam-fake-codex-"));
  const oldBin = process.env.STARB_CODEX_BIN;
  const oldOpenaiKey = process.env.OPENAI_API_KEY;
  const oldRetryAttempts = process.env.STARB_CODEX_EXEC_MAX_ATTEMPTS;
  const oldRetryDelayMs = process.env.STARB_CODEX_EXEC_RETRY_INITIAL_DELAY_MS;

  try {
    const { binDir } = await writeFakeCodexBin({ dir: tmp });
    process.env.STARB_CODEX_BIN =
      process.platform === "win32"
        ? path.join(binDir, "codex.cmd")
        : path.join(binDir, "codex");
    process.env.FAKE_CODEX_EXPECT_SEARCH = "0";
    process.env.FAKE_CODEX_FAIL_FIRST_RETRYABLE = "1";
    process.env.FAKE_CODEX_FLAKY_STATE_PATH = path.join(tmp, "flaky-state.txt");
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.STARB_CODEX_EXEC_MAX_ATTEMPTS = "2";
    process.env.STARB_CODEX_EXEC_RETRY_INITIAL_DELAY_MS = "50";
    delete process.env.STARB_CODEX_JSON_EVENTS;

    const outSchema = path.join(tmp, "schema.json");
    const outMsg = path.join(tmp, "out.json");

    const res = await runCodexExec({
      cwd: tmp,
      prompt: "hello",
      outputSchemaPath: outSchema,
      outputLastMessagePath: outMsg,
      enableWebSearch: false,
      timeoutMs: 10_000,
    });

    assert.equal(res.exitCode, 0);
    assert.equal(res.attemptCount, 2);
    assert.match(res.stdout, /ok/);
  } finally {
    if (oldBin === undefined) delete process.env.STARB_CODEX_BIN;
    else process.env.STARB_CODEX_BIN = oldBin;
    if (oldOpenaiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldOpenaiKey;
    if (oldRetryAttempts === undefined)
      delete process.env.STARB_CODEX_EXEC_MAX_ATTEMPTS;
    else process.env.STARB_CODEX_EXEC_MAX_ATTEMPTS = oldRetryAttempts;
    if (oldRetryDelayMs === undefined)
      delete process.env.STARB_CODEX_EXEC_RETRY_INITIAL_DELAY_MS;
    else process.env.STARB_CODEX_EXEC_RETRY_INITIAL_DELAY_MS = oldRetryDelayMs;
    delete process.env.FAKE_CODEX_EXPECT_SEARCH;
    delete process.env.FAKE_CODEX_FAIL_FIRST_RETRYABLE;
    delete process.env.FAKE_CODEX_FLAKY_STATE_PATH;
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("runCodexExec passes web search flag before subcommand", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "starbeam-fake-codex-"));
  const oldBin = process.env.STARB_CODEX_BIN;
  const oldOpenaiKey = process.env.OPENAI_API_KEY;

  try {
    const { binDir } = await writeFakeCodexBin({ dir: tmp });
    process.env.STARB_CODEX_BIN =
      process.platform === "win32"
        ? path.join(binDir, "codex.cmd")
        : path.join(binDir, "codex");
    process.env.FAKE_CODEX_EXPECT_SEARCH = "1";
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.STARB_CODEX_JSON_EVENTS;

    const outSchema = path.join(tmp, "schema.json");
    const outMsg = path.join(tmp, "out.json");

    const res = await runCodexExec({
      cwd: tmp,
      prompt: "hello",
      outputSchemaPath: outSchema,
      outputLastMessagePath: outMsg,
      enableWebSearch: true,
      timeoutMs: 10_000,
    });

    assert.equal(res.exitCode, 0);
    assert.match(res.stdout, /ok/);
  } finally {
    if (oldBin === undefined) delete process.env.STARB_CODEX_BIN;
    else process.env.STARB_CODEX_BIN = oldBin;
    if (oldOpenaiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldOpenaiKey;
    delete process.env.FAKE_CODEX_EXPECT_SEARCH;
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
});
