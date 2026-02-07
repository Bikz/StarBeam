import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import { runCodexExec } from "./exec";
import { materializeWorkspaceContextForCodex } from "./materialize";

const CitationSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
});

const BaseCardSchema = z.object({
  department: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  why: z.string().min(1),
  action: z.string().min(1),
});

const InternalCardSchema = BaseCardSchema.extend({
  kind: z.literal("INTERNAL"),
  citations: z.array(CitationSchema).max(6),
});

const WebResearchCardSchema = BaseCardSchema.extend({
  kind: z.literal("WEB_RESEARCH"),
  citations: z.array(CitationSchema).min(1).max(6),
});

export const CodexPulseCardSchema = z.discriminatedUnion("kind", [
  WebResearchCardSchema,
  InternalCardSchema,
]);

export const CodexPulseMemorySchema = z.object({
  baseMarkdown: z.string().min(1).max(25_000),
  dailyMarkdown: z.string().min(1).max(25_000),
});

export const CodexPulseOutputSchema = z.object({
  memory: CodexPulseMemorySchema,
  cards: z.array(CodexPulseCardSchema).max(7),
});

export type CodexPulseOutput = z.infer<typeof CodexPulseOutputSchema>;

function pulseOutputJsonSchema(args: { includeWebResearch: boolean }): unknown {
  const baseCardSchema = {
    type: "object",
    additionalProperties: false,
    required: ["kind", "title", "body", "why", "action", "citations"],
    properties: {
      kind: { type: "string" },
      department: { type: "string" },
      title: { type: "string" },
      body: { type: "string" },
      why: { type: "string" },
      action: { type: "string" },
      citations: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["url"],
          properties: {
            url: { type: "string" },
            title: { type: "string" },
          },
        },
      },
    },
  };

  const internal = {
    ...baseCardSchema,
    properties: { ...baseCardSchema.properties, kind: { const: "INTERNAL" } },
  };

  const web = {
    ...baseCardSchema,
    properties: {
      ...baseCardSchema.properties,
      kind: { const: "WEB_RESEARCH" },
      citations: {
        ...baseCardSchema.properties.citations,
        minItems: 1,
      },
    },
  };

  return {
    type: "object",
    additionalProperties: false,
    required: ["memory", "cards"],
    properties: {
      memory: {
        type: "object",
        additionalProperties: false,
        required: ["baseMarkdown", "dailyMarkdown"],
        properties: {
          baseMarkdown: { type: "string" },
          dailyMarkdown: { type: "string" },
        },
      },
      cards: {
        type: "array",
        maxItems: 7,
        items: args.includeWebResearch ? { oneOf: [web, internal] } : internal,
      },
    },
  };
}

function buildPulsePrompt(args: {
  workspaceName: string;
  departmentNames: string[];
  includeWebResearch: boolean;
}): string {
  return [
    "You are Starbeam, a nightly pulse agent.",
    "",
    "You are running inside a materialized context directory.",
    "Important files:",
    "- workspace.json",
    "- profile.json",
    "- departments.json",
    "- goals.json",
    "- source-items.jsonl",
    "- blobs/ (optional; contains decrypted file snapshots)",
    "- memory/ (optional; contains prior-day base and daily journal summaries)",
    "",
    "Task: Generate today's pulse cards.",
    "",
    args.includeWebResearch
      ? [
          "You may use web research to find credible signals from the last 72 hours.",
          "Web research budget: use at most 3 web searches total (prefer 1-2).",
          "Only include claims that are supported by citations you provide.",
          "Do not include numbers unless a citation explicitly supports them.",
        ].join("\n")
      : "Do NOT use web research. Only generate INTERNAL cards from the provided context.",
    "",
    "Memory task (required): Update Starbeam memory.",
    "- baseMarkdown: a compact evergreen summary of the user's workstreams/projects, goals, key decisions, and ongoing threads.",
    "- dailyMarkdown: an additive daily journal entry for today including what changed + what pulse items you delivered today.",
    "- Keep baseMarkdown <= 2000 words; keep dailyMarkdown <= 1200 words.",
    "- Do not delete history; treat memory as append-only journaling.",
    "",
    "Use the internal source items (email/calendar/drive/github/linear/notion) to create INTERNAL cards that help the user prioritize.",
    "Use departments.json (including promptTemplate) + goals.json to keep the pulse aligned with goals and tracks.",
    "Keep it direct and actionable.",
    "",
    `Company/workspace: ${args.workspaceName}`,
    args.departmentNames.length
      ? `Departments/tracks (user belongs to): ${args.departmentNames.join(", ")}`
      : "This is a personal workspace (no departments).",
    "",
    "Output STRICT JSON only (no markdown), matching the provided JSON Schema.",
    "",
    "Card rules:",
    "- Total cards: 3-7 max (fewer is fine if there isn't credible signal).",
    args.includeWebResearch ? "- WEB_RESEARCH cards must have 1-6 citations." : "",
    "- INTERNAL cards can have 0 citations, but should reference source item URLs when possible.",
    "- Each card body should be 2-4 lines.",
    "",
  ].join("\n");
}

export async function generatePulseCardsWithCodexExec(args: {
  workspace: { id: string; name: string; slug: string };
  profile: { websiteUrl?: string | null; description?: string | null; competitorDomains?: string[] | null } | null;
  goals: Array<{ id: string; title: string; body?: string | null; priority: string; departmentId?: string | null }>;
  departments: Array<{ id: string; name: string; promptTemplate: string; memberships: Array<{ userId: string }> }>;
  userId: string;
  model?: string;
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  includeWebResearch?: boolean;
}): Promise<{
  output: CodexPulseOutput;
  departmentNameToId: Map<string, string>;
}> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "starbeam-codex-run-"));
  const schemaPath = path.join(tmp, "pulse.schema.json");
  const outputPath = path.join(tmp, "pulse.output.json");
  const includeWebResearch = Boolean(args.includeWebResearch);

  try {
    await fs.writeFile(
      schemaPath,
      JSON.stringify(pulseOutputJsonSchema({ includeWebResearch }), null, 2),
      "utf8",
    );

    const { dir, cleanup, departmentNameToId } = await materializeWorkspaceContextForCodex({
      workspace: args.workspace,
      profile: args.profile,
      goals: args.goals,
      departments: args.departments,
      userId: args.userId,
    });

    try {
      const departmentNames = args.departments
        .filter((d) => d.memberships.some((m) => m.userId === args.userId))
        .map((d) => d.name);

      const prompt = buildPulsePrompt({
        workspaceName: args.workspace.name,
        departmentNames,
        includeWebResearch,
      });

      const res = await runCodexExec({
        cwd: dir,
        prompt,
        model: args.model,
        reasoningEffort: args.reasoningEffort,
        enableWebSearch: includeWebResearch,
        outputSchemaPath: schemaPath,
        outputLastMessagePath: outputPath,
      });

      if (res.exitCode !== 0) {
        const hint = res.stderr.trim() || res.stdout.trim();
        throw new Error(`codex exec failed (exit ${res.exitCode}). ${hint}`.trim());
      }

      const text = await fs.readFile(outputPath, "utf8");
      const parsedJson = JSON.parse(text) as unknown;
      const output = CodexPulseOutputSchema.parse(parsedJson);

      return { output, departmentNameToId };
    } finally {
      await cleanup();
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}
