import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import { runCodexExec } from "./exec";
import { materializeWorkspaceContextForCodex } from "./materialize";

const BootstrapGoalSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(0).max(1200).optional(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
});

const BootstrapProfileSchema = z.object({
  websiteUrl: z.string().url().optional(),
  description: z.string().min(1).max(2000),
  competitorDomains: z.array(z.string().min(1).max(120)).max(10).default([]),
});

export const CodexWorkspaceBootstrapOutputSchema = z.object({
  profile: BootstrapProfileSchema,
  goals: z.array(BootstrapGoalSchema).min(1).max(5),
});

export type CodexWorkspaceBootstrapOutput = z.infer<typeof CodexWorkspaceBootstrapOutputSchema>;

function bootstrapOutputJsonSchema(): unknown {
  return {
    type: "object",
    additionalProperties: false,
    required: ["profile", "goals"],
    properties: {
      profile: {
        type: "object",
        additionalProperties: false,
        required: ["description", "competitorDomains"],
        properties: {
          websiteUrl: { type: "string", format: "uri" },
          description: { type: "string" },
          competitorDomains: { type: "array", items: { type: "string" }, maxItems: 10 },
        },
      },
      goals: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "priority"],
          properties: {
            title: { type: "string" },
            body: { type: "string" },
            priority: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
          },
        },
      },
    },
  };
}

function buildBootstrapPrompt(args: { workspaceName: string; enableWebSearch: boolean }): string {
  return [
    "You are Starbeam, a workspace onboarding assistant.",
    "",
    "You are running inside a materialized context directory that may include:",
    "- workspace.json (workspace name/slug)",
    "- profile.json (may be null)",
    "- goals.json (may be empty)",
    "- source-items.jsonl (recent signals from connected tools; may be empty early on)",
    "- blobs/ (optional; decrypted file snapshots)",
    "",
    "Task: Propose a workspace profile and a small set of starter goals.",
    "",
    args.enableWebSearch
      ? [
          "You MAY use at most 1 web search to confirm the company/product description or competitor domains.",
          "If you cannot confidently identify a website or competitors, omit websiteUrl and keep competitorDomains empty.",
        ].join("\n")
      : "Do NOT use web search.",
    "",
    "Output rules:",
    "- profile.description: 1-3 short paragraphs, crisp and factual.",
    "- profile.competitorDomains: 0-10 domains only (no URLs, no @handles).",
    "- goals: 1-3 items is ideal; max 5. Keep them actionable, not generic.",
    "- Priorities: HIGH / MEDIUM / LOW.",
    "",
    `Workspace: ${args.workspaceName}`,
    "",
    "Output STRICT JSON only (no markdown), matching the provided JSON Schema.",
    "",
  ].join("\n");
}

export async function bootstrapWorkspaceWithCodexExec(args: {
  workspace: { id: string; name: string; slug: string };
  profile: { websiteUrl?: string | null; description?: string | null; competitorDomains?: string[] | null } | null;
  goals: Array<{ id: string; title: string; body?: string | null; priority: string; departmentId?: string | null }>;
  departments: Array<{ id: string; name: string; promptTemplate: string; memberships: Array<{ userId: string }> }>;
  userId: string;
  model?: string;
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  enableWebSearch?: boolean;
}): Promise<{
  output: CodexWorkspaceBootstrapOutput;
  estimate: {
    promptBytes: number;
    contextBytes: number;
    approxInputTokens: number;
    approxOutputTokens: number;
    durationMs: number;
  };
}> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "starbeam-codex-bootstrap-"));
  const schemaPath = path.join(tmp, "bootstrap.schema.json");
  const outputPath = path.join(tmp, "bootstrap.output.json");
  const enableWebSearch = Boolean(args.enableWebSearch);

  try {
    await fs.writeFile(
      schemaPath,
      JSON.stringify(bootstrapOutputJsonSchema(), null, 2),
      "utf8",
    );

    const { dir, cleanup } = await materializeWorkspaceContextForCodex({
      workspace: args.workspace,
      profile: args.profile,
      goals: args.goals,
      departments: args.departments,
      userId: args.userId,
    });

    try {
      const prompt = buildBootstrapPrompt({
        workspaceName: args.workspace.name,
        enableWebSearch,
      });

      const promptBytes = Buffer.byteLength(prompt, "utf8");
      const contextBytes = await directoryBytes(dir);

      const started = Date.now();
      const res = await runCodexExec({
        cwd: dir,
        prompt,
        model: args.model,
        reasoningEffort: args.reasoningEffort,
        enableWebSearch,
        outputSchemaPath: schemaPath,
        outputLastMessagePath: outputPath,
        timeoutMs: 3 * 60 * 1000,
      });
      const durationMs = Date.now() - started;

      if (res.exitCode !== 0) {
        const hint = res.stderr.trim() || res.stdout.trim();
        throw new Error(`codex exec failed (exit ${res.exitCode}). ${hint}`.trim());
      }

      const text = await fs.readFile(outputPath, "utf8");
      const parsedJson = JSON.parse(text) as unknown;
      const output = CodexWorkspaceBootstrapOutputSchema.parse(parsedJson);
      const approxInputTokens = Math.ceil((promptBytes + contextBytes) / 4);
      const approxOutputTokens = Math.ceil(Buffer.byteLength(text, "utf8") / 4);
      return { output, estimate: { promptBytes, contextBytes, approxInputTokens, approxOutputTokens, durationMs } };
    } finally {
      await cleanup();
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function directoryBytes(dir: string): Promise<number> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let total = 0;

  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isFile()) {
      const s = await fs.stat(p);
      total += s.size;
    } else if (e.isDirectory() && e.name === "blobs") {
      const blobs = await fs.readdir(p, { withFileTypes: true });
      for (const b of blobs) {
        if (!b.isFile()) continue;
        const s = await fs.stat(path.join(p, b.name));
        total += s.size;
      }
    }
  }

  return total;
}
