import { z } from "zod";

import type { PulseGenerationResult } from "../codex/pulse";
import type { PersonaSubmode, PersonaTrack } from "../insights/persona";
import { normalizeInsightMeta } from "../insights/ranker";
import {
  buildHostedShellNetworkPolicy,
  parseHostedShellNetworkProfile,
} from "./networkPolicy";

type HostedSkillRef = {
  type: "skill_reference";
  skill_id: string;
  version?: number | "latest";
};

const CitationSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
});

const HostedCardSchema = z.object({
  kind: z.enum(["INTERNAL", "WEB_RESEARCH"]),
  department: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  why: z.string().min(1),
  action: z.string().min(1),
  citations: z.array(CitationSchema).max(6),
  insightMeta: z
    .object({
      personaTrack: z.enum([
        "SOLO_FOUNDER",
        "SMALL_TEAM_5_10",
        "GROWTH_TEAM_11_50",
        "UNKNOWN",
      ]),
      personaSubmode: z
        .enum([
          "SHIP_HEAVY",
          "GTM_HEAVY",
          "ALIGNMENT_GAP",
          "EXECUTION_DRIFT",
          "UNKNOWN",
        ])
        .optional(),
      skillRef: z.string().min(1).max(120).optional(),
      skillOrigin: z.enum(["CURATED", "PARTNER", "DISCOVERED"]).optional(),
      expectedHelpfulLift: z.number().min(0).max(1).optional(),
      expectedActionLift: z.number().min(0).max(1).optional(),
      relevanceScore: z.number().min(0).max(1).optional(),
      actionabilityScore: z.number().min(0).max(1).optional(),
      confidenceScore: z.number().min(0).max(1).optional(),
      noveltyScore: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

const HostedOutputSchema = z.object({
  memory: z.object({
    baseMarkdown: z.string().min(1).max(25_000),
    dailyMarkdown: z.string().min(1).max(25_000),
  }),
  cards: z.array(HostedCardSchema).min(1).max(7),
});

const HostedOutputJsonSchema = {
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
      minItems: 1,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "body", "why", "action", "citations"],
        properties: {
          kind: { type: "string", enum: ["INTERNAL", "WEB_RESEARCH"] },
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
                url: { type: "string", format: "uri" },
                title: { type: "string" },
              },
            },
          },
          insightMeta: {
            type: "object",
            additionalProperties: false,
            required: ["personaTrack"],
            properties: {
              personaTrack: {
                type: "string",
                enum: [
                  "SOLO_FOUNDER",
                  "SMALL_TEAM_5_10",
                  "GROWTH_TEAM_11_50",
                  "UNKNOWN",
                ],
              },
              personaSubmode: {
                type: "string",
                enum: [
                  "SHIP_HEAVY",
                  "GTM_HEAVY",
                  "ALIGNMENT_GAP",
                  "EXECUTION_DRIFT",
                  "UNKNOWN",
                ],
              },
              skillRef: { type: "string" },
              skillOrigin: {
                type: "string",
                enum: ["CURATED", "PARTNER", "DISCOVERED"],
              },
              expectedHelpfulLift: { type: "number", minimum: 0, maximum: 1 },
              expectedActionLift: { type: "number", minimum: 0, maximum: 1 },
              relevanceScore: { type: "number", minimum: 0, maximum: 1 },
              actionabilityScore: { type: "number", minimum: 0, maximum: 1 },
              confidenceScore: { type: "number", minimum: 0, maximum: 1 },
              noveltyScore: { type: "number", minimum: 0, maximum: 1 },
            },
          },
        },
      },
    },
  },
} as const;

type HostedOutput = z.infer<typeof HostedOutputSchema>;

function summarizeGoals(
  goals: Array<{ title: string; body?: string | null; priority: string }>,
): string {
  if (goals.length === 0) return "- none";
  return goals
    .slice(0, 6)
    .map(
      (goal) =>
        `- [${goal.priority}] ${goal.title}${goal.body ? `: ${goal.body}` : ""}`,
    )
    .join("\n");
}

function summarizeTasks(
  tasks: Array<{
    title: string;
    body?: string | null;
    status: string;
    dueAt?: Date | null;
    updatedAt?: Date;
    sourceItem?: { type: string; title: string } | null;
  }>,
): string {
  if (tasks.length === 0) return "- none";
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  return tasks
    .slice(0, 12)
    .map((task) => {
      const due = task.dueAt
        ? ` due=${task.dueAt.toISOString().slice(0, 10)}`
        : "";
      const source = task.sourceItem ? ` source=${task.sourceItem.type}` : "";
      const age =
        task.updatedAt && task.status === "OPEN"
          ? ` open_for=${Math.max(0, Math.floor((now - task.updatedAt.getTime()) / dayMs))}d`
          : "";
      const body = task.body ? ` | ${task.body}` : "";
      return `- [${task.status}] ${task.title}${due}${age}${source}${body}`;
    })
    .join("\n");
}

function buildHostedPrompt(args: {
  workspaceName: string;
  profile: {
    websiteUrl?: string | null;
    description?: string | null;
    competitorDomains?: string[] | null;
  } | null;
  goals: Array<{
    title: string;
    body?: string | null;
    priority: string;
  }>;
  personalProfile: {
    fullName?: string | null;
    location?: string | null;
    company?: string | null;
    companyUrl?: string | null;
    linkedinUrl?: string | null;
    websiteUrl?: string | null;
    jobTitle?: string | null;
    about?: string | null;
  } | null;
  personalGoals: Array<{
    title: string;
    body?: string | null;
    active: boolean;
    targetWindow?: string | null;
  }>;
  tasks: Array<{
    title: string;
    body?: string | null;
    status: string;
    dueAt?: Date | null;
    updatedAt?: Date;
    sourceItem?: { type: string; title: string } | null;
  }>;
  personaTrack: PersonaTrack;
  personaSubmode: PersonaSubmode;
  allowedSkillRefs: string[];
}): string {
  const personalGoals = args.personalGoals
    .filter((goal) => goal.active)
    .slice(0, 4)
    .map((goal) => `- ${goal.title}${goal.body ? `: ${goal.body}` : ""}`)
    .join("\n");

  return [
    "You are Starbeam's hosted insight enrichment engine.",
    "",
    "Output STRICT JSON matching the schema. Do not output markdown.",
    "Generate 3-7 high-quality cards focused on actionable, personalized next steps.",
    "Balance internal execution with distribution and outcome learning.",
    "If there are OPEN tasks with open_for>=1d, include at least one card that helps unblock and finish one stale task today.",
    "If a claim references external facts, include citations.",
    "",
    `Workspace: ${args.workspaceName}`,
    `Persona track: ${args.personaTrack}`,
    `Persona submode: ${args.personaSubmode}`,
    args.allowedSkillRefs.length
      ? `Skill frames to apply when relevant: ${args.allowedSkillRefs.join(", ")}`
      : "No explicit skill frames provided.",
    "",
    "Workspace profile:",
    `- website: ${args.profile?.websiteUrl ?? "n/a"}`,
    `- description: ${args.profile?.description ?? "n/a"}`,
    `- competitors: ${(args.profile?.competitorDomains ?? []).slice(0, 8).join(", ") || "n/a"}`,
    "",
    "Workspace goals:",
    summarizeGoals(args.goals),
    "",
    "Personal profile:",
    `- name: ${args.personalProfile?.fullName ?? "n/a"}`,
    `- location: ${args.personalProfile?.location ?? "n/a"}`,
    `- role: ${args.personalProfile?.jobTitle ?? "n/a"}`,
    `- company/project: ${args.personalProfile?.company ?? "n/a"}`,
    `- company url: ${args.personalProfile?.companyUrl ?? "n/a"}`,
    `- linkedin: ${args.personalProfile?.linkedinUrl ?? "n/a"}`,
    `- website: ${args.personalProfile?.websiteUrl ?? "n/a"}`,
    `- about: ${args.personalProfile?.about ?? "n/a"}`,
    "",
    "Personal goals:",
    personalGoals || "- none",
    "",
    "Open tasks and context:",
    summarizeTasks(args.tasks),
    "",
    "Memory task:",
    "- baseMarkdown: compact evergreen summary of user's workstreams/goals.",
    "- dailyMarkdown: today's changes and delivered actions.",
    "- Keep both concise and grounded in provided context.",
  ].join("\n");
}

function extractResponseText(response: unknown): string {
  const r = response as { output_text?: unknown; output?: unknown[] };
  if (typeof r.output_text === "string" && r.output_text.trim()) {
    return r.output_text;
  }

  const output = Array.isArray(r.output) ? r.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as { type?: unknown; text?: unknown };
      if (p.type === "output_text" && typeof p.text === "string" && p.text) {
        chunks.push(p.text);
      }
    }
  }
  return chunks.join("").trim();
}

function parseUsage(response: unknown):
  | {
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
    }
  | undefined {
  const usage = (response as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return undefined;
  const u = usage as {
    input_tokens?: unknown;
    output_tokens?: unknown;
    input_tokens_details?: { cached_tokens?: unknown } | null;
  };
  return {
    inputTokens: typeof u.input_tokens === "number" ? u.input_tokens : 0,
    cachedInputTokens:
      typeof u.input_tokens_details?.cached_tokens === "number"
        ? u.input_tokens_details.cached_tokens
        : 0,
    outputTokens: typeof u.output_tokens === "number" ? u.output_tokens : 0,
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
): Promise<{ value: T; attemptCount: number }> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      const value = await fn();
      return { value, attemptCount: attempt };
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (!/responses failed \((408|409|429|500|502|503|504)\)/.test(message)) {
        throw err;
      }
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
}

type SkillMapEntry = { skill_id: string; version?: number | "latest" };

function parseSkillMapEnv(): Record<string, SkillMapEntry> | null {
  const raw = (process.env.STARB_HOSTED_SHELL_SKILL_MAP_JSON ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, SkillMapEntry>;
  } catch {
    return null;
  }
}

function resolveHostedSkills(allowedSkillRefs: string[]): HostedSkillRef[] {
  const map = parseSkillMapEnv();
  if (!map) return [];

  const refs: HostedSkillRef[] = [];
  for (const ref of allowedSkillRefs) {
    const entry = map[ref];
    if (
      !entry ||
      typeof entry.skill_id !== "string" ||
      !entry.skill_id.trim()
    ) {
      continue;
    }
    refs.push({
      type: "skill_reference",
      skill_id: entry.skill_id.trim(),
      ...(typeof entry.version === "number" || entry.version === "latest"
        ? { version: entry.version }
        : {}),
    });
  }
  return refs;
}

async function postResponsesApi(args: {
  apiKey: string;
  body: Record<string, unknown>;
}): Promise<unknown> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args.body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`responses failed (${res.status}): ${text.slice(0, 600)}`);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("responses returned non-JSON body");
  }
}

export async function generatePulseCardsWithHostedShell(args: {
  workspace: { id: string; name: string; slug: string };
  profile: {
    websiteUrl?: string | null;
    description?: string | null;
    competitorDomains?: string[] | null;
  } | null;
  goals: Array<{
    id: string;
    title: string;
    body?: string | null;
    priority: string;
    departmentId?: string | null;
  }>;
  personalProfile?: {
    fullName?: string | null;
    location?: string | null;
    company?: string | null;
    companyUrl?: string | null;
    linkedinUrl?: string | null;
    websiteUrl?: string | null;
    jobTitle?: string | null;
    about?: string | null;
  } | null;
  personalGoals?: Array<{
    id: string;
    title: string;
    body?: string | null;
    active: boolean;
    targetWindow?: string | null;
  }>;
  tasks?: Array<{
    id: string;
    title: string;
    body?: string | null;
    status: string;
    dueAt?: Date | null;
    snoozedUntil?: Date | null;
    updatedAt: Date;
    sourceItem?: {
      id: string;
      type: string;
      title: string;
      url?: string | null;
    } | null;
  }>;
  departments: Array<{
    id: string;
    name: string;
    promptTemplate: string;
    memberships: Array<{ userId: string }>;
  }>;
  model?: string;
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  personaTrack?: PersonaTrack;
  personaSubmode?: PersonaSubmode;
  allowedSkillRefs?: string[];
  openaiApiKey: string;
  compactionEnabled: boolean;
}): Promise<PulseGenerationResult> {
  const allowedSkillRefs = args.allowedSkillRefs ?? [];
  const prompt = buildHostedPrompt({
    workspaceName: args.workspace.name,
    profile: args.profile,
    goals: args.goals,
    personalProfile: args.personalProfile ?? null,
    personalGoals: args.personalGoals ?? [],
    tasks: args.tasks ?? [],
    personaTrack: args.personaTrack ?? "UNKNOWN",
    personaSubmode: args.personaSubmode ?? "UNKNOWN",
    allowedSkillRefs,
  });
  const promptBytes = Buffer.byteLength(prompt, "utf8");

  const departmentNameToId = new Map(
    args.departments.map((department) => [department.name, department.id]),
  );

  const networkPolicy = buildHostedShellNetworkPolicy({
    profile: parseHostedShellNetworkProfile(
      process.env.STARB_HOSTED_SHELL_NETWORK_PROFILE,
    ),
  });
  const skills = resolveHostedSkills(allowedSkillRefs);

  const toolEnvironment: Record<string, unknown> = {
    type: "container_auto",
    network_policy: networkPolicy,
    ...(skills.length ? { skills } : {}),
  };

  const body: Record<string, unknown> = {
    model: args.model ?? "gpt-5.2-codex",
    store: false,
    input: prompt,
    tools: [{ type: "shell", environment: toolEnvironment }],
    reasoning: { effort: args.reasoningEffort ?? "medium" },
    max_output_tokens: 2400,
    text: {
      format: {
        type: "json_schema",
        name: "starbeam_hosted_shell_output",
        strict: true,
        schema: HostedOutputJsonSchema,
      },
    },
    ...(args.compactionEnabled
      ? {
          context_management: [
            { type: "compaction", compact_threshold: 200_000 },
          ],
        }
      : {}),
  };

  const started = Date.now();
  const first = await withRetry(
    async () => postResponsesApi({ apiKey: args.openaiApiKey, body }),
    3,
  );

  let responseForOutput = first.value;
  let attemptCount = first.attemptCount;

  const firstResponseId = (first.value as { id?: unknown }).id;
  if (
    args.compactionEnabled &&
    typeof firstResponseId === "string" &&
    firstResponseId
  ) {
    try {
      const followUp = await withRetry(
        async () =>
          postResponsesApi({
            apiKey: args.openaiApiKey,
            body: {
              model: args.model ?? "gpt-5.2-codex",
              store: false,
              previous_response_id: firstResponseId,
              input:
                "Return final JSON only, matching the same response schema and grounded in prior context.",
              max_output_tokens: 2400,
              text: {
                format: {
                  type: "json_schema",
                  name: "starbeam_hosted_shell_output",
                  strict: true,
                  schema: HostedOutputJsonSchema,
                },
              },
            },
          }),
        2,
      );
      responseForOutput = followUp.value;
      attemptCount += followUp.attemptCount;
    } catch {
      // Non-fatal: keep first response as output source.
    }
  }

  const outputText = extractResponseText(responseForOutput);
  if (!outputText.trim()) {
    throw new Error("Hosted shell response returned empty output.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(outputText);
  } catch {
    throw new Error("Hosted shell response returned non-JSON output.");
  }

  const parsed = HostedOutputSchema.parse(parsedJson);
  const normalized: HostedOutput = {
    memory: parsed.memory,
    cards: parsed.cards.map((card) => ({
      ...card,
      insightMeta: normalizeInsightMeta({
        personaTrack:
          card.insightMeta?.personaTrack ?? args.personaTrack ?? "UNKNOWN",
        personaSubmode:
          card.insightMeta?.personaSubmode ?? args.personaSubmode ?? "UNKNOWN",
        skillRef:
          card.insightMeta?.skillRef &&
          allowedSkillRefs.includes(card.insightMeta.skillRef)
            ? card.insightMeta.skillRef
            : allowedSkillRefs[0],
        skillOrigin: card.insightMeta?.skillOrigin,
        expectedHelpfulLift: card.insightMeta?.expectedHelpfulLift,
        expectedActionLift: card.insightMeta?.expectedActionLift,
        relevanceScore: card.insightMeta?.relevanceScore,
        actionabilityScore: card.insightMeta?.actionabilityScore,
        confidenceScore: card.insightMeta?.confidenceScore,
        noveltyScore: card.insightMeta?.noveltyScore,
      }),
    })),
  };

  const durationMs = Date.now() - started;
  const approxOutputTokens = Math.ceil(
    Buffer.byteLength(outputText, "utf8") / 4,
  );
  const approxInputTokens = Math.ceil(promptBytes / 4);
  const usage = parseUsage(responseForOutput);

  return {
    output: normalized,
    departmentNameToId,
    estimate: {
      provider: "openai_hosted_shell",
      attemptCount,
      promptBytes,
      contextBytes: 0,
      approxInputTokens,
      approxOutputTokens,
      durationMs,
      ...(usage ? { usage } : {}),
    },
  };
}
