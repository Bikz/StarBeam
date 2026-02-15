import OpenAI from "openai";
import { z } from "zod";

import type { PersonaSubmode, PersonaTrack } from "./persona";

const CandidateSchema = z.object({
  skillRef: z.string().min(1).max(160),
  source: z.enum(["curated", "partner", "external"]),
  fitReason: z.string().min(1).max(500),
  expectedLift: z.object({
    helpfulRatePct: z.number().min(0).max(100),
    actionCompletionRatePct: z.number().min(0).max(100),
  }),
  risk: z.enum(["low", "medium", "high"]),
  guardrails: z.array(z.string().min(1).max(220)).max(6),
  experimentPlan: z.object({
    cohort: z.string().min(1).max(120),
    durationDays: z.number().int().min(1).max(30),
    successMetric: z.string().min(1).max(220),
  }),
});

const SkillDiscoveryOutputSchema = z.object({
  candidates: z.array(CandidateSchema).max(5),
});

const SkillEvaluatorOutputSchema = z.object({
  decision: z.enum(["USE", "SKIP"]),
  fitReason: z.string().min(1).max(500),
  risk: z.enum(["low", "medium", "high"]),
  expectedHelpfulLift: z.number().min(0).max(1),
  expectedActionLift: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
});

const SkillDiscoveryOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "skillRef",
          "source",
          "fitReason",
          "expectedLift",
          "risk",
          "guardrails",
          "experimentPlan",
        ],
        properties: {
          skillRef: { type: "string" },
          source: { type: "string", enum: ["curated", "partner", "external"] },
          fitReason: { type: "string" },
          expectedLift: {
            type: "object",
            additionalProperties: false,
            required: ["helpfulRatePct", "actionCompletionRatePct"],
            properties: {
              helpfulRatePct: { type: "number", minimum: 0, maximum: 100 },
              actionCompletionRatePct: {
                type: "number",
                minimum: 0,
                maximum: 100,
              },
            },
          },
          risk: { type: "string", enum: ["low", "medium", "high"] },
          guardrails: {
            type: "array",
            maxItems: 6,
            items: { type: "string" },
          },
          experimentPlan: {
            type: "object",
            additionalProperties: false,
            required: ["cohort", "durationDays", "successMetric"],
            properties: {
              cohort: { type: "string" },
              durationDays: { type: "integer", minimum: 1, maximum: 30 },
              successMetric: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const;

const SkillEvaluatorOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "decision",
    "fitReason",
    "risk",
    "expectedHelpfulLift",
    "expectedActionLift",
    "confidence",
  ],
  properties: {
    decision: { type: "string", enum: ["USE", "SKIP"] },
    fitReason: { type: "string" },
    risk: { type: "string", enum: ["low", "medium", "high"] },
    expectedHelpfulLift: { type: "number", minimum: 0, maximum: 1 },
    expectedActionLift: { type: "number", minimum: 0, maximum: 1 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

function summarizeList(values: string[], max = 8): string {
  const compact = values
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, max);
  return compact.length ? compact.join(", ") : "none";
}

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
    status: string;
    sourceType?: string | null;
    updatedAt?: Date;
  }>,
): string {
  if (tasks.length === 0) return "- none";
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  return tasks
    .slice(0, 10)
    .map((task) => {
      const age =
        task.updatedAt && task.status === "OPEN"
          ? ` open_for=${Math.max(0, Math.floor((now - task.updatedAt.getTime()) / dayMs))}d`
          : "";
      return `- [${task.status}] ${task.title}${age}${task.sourceType ? ` (${task.sourceType})` : ""}`;
    })
    .join("\n");
}

export function buildSkillDiscoveryPrompt(args: {
  workspaceName: string;
  personaTrack: PersonaTrack;
  allowedSkillRefs: string[];
  profile: {
    websiteUrl?: string | null;
    description?: string | null;
    competitorDomains?: string[] | null;
  } | null;
  goals: Array<{ title: string; body?: string | null; priority: string }>;
  tasks: Array<{
    title: string;
    status: string;
    sourceType?: string | null;
    updatedAt?: Date;
  }>;
}): string {
  return [
    "Given this user/workspace context, suggest up to 5 candidate skills that could improve daily insight quality.",
    "For each skill: why it fits this persona/stage, expected user outcome, risk level, required guardrails, and whether to test in shadow mode first.",
    "Prioritize actionability and measurable outcome lift, not novelty.",
    "Reject skills that are generic, unsafe, or weakly relevant.",
    "Source preference: approved curated/partner skills first, then external skills discoverable from skills.sh.",
    "Do not recommend autonomous write/action skills; advisory-only recommendations only.",
    "",
    `Workspace: ${args.workspaceName}`,
    `Persona track: ${args.personaTrack}`,
    `Existing skill refs: ${summarizeList(args.allowedSkillRefs, 10)}`,
    `Website: ${args.profile?.websiteUrl ?? "n/a"}`,
    `Description: ${args.profile?.description ?? "n/a"}`,
    `Competitors: ${summarizeList(args.profile?.competitorDomains ?? [])}`,
    "",
    "Goals:",
    summarizeGoals(args.goals),
    "",
    "Open tasks snapshot:",
    summarizeTasks(args.tasks),
    "",
    "Output strict JSON matching the provided schema.",
  ].join("\n");
}

export function buildGoalHelpfulnessEvaluatorPrompt(args: {
  workspaceName: string;
  personaTrack: PersonaTrack;
  personaSubmode: PersonaSubmode;
  goals: Array<{ title: string; body?: string | null; priority: string }>;
  tasks: Array<{
    title: string;
    status: string;
    sourceType?: string | null;
    updatedAt?: Date;
  }>;
  candidate: z.infer<typeof CandidateSchema>;
}): string {
  return [
    "You are Starbeam's skill evaluator.",
    "Decide if using this discovered skill in this run will materially improve advice quality for the user.",
    "Advisory-only constraint: no autonomous write actions.",
    "Reject if relevance is weak, risk is high, or expected lift is marginal.",
    "",
    `Workspace: ${args.workspaceName}`,
    `Persona track: ${args.personaTrack}`,
    `Persona submode: ${args.personaSubmode}`,
    "",
    "Goals:",
    summarizeGoals(args.goals),
    "",
    "Open tasks snapshot:",
    summarizeTasks(args.tasks),
    "",
    "Candidate skill:",
    `- skillRef: ${args.candidate.skillRef}`,
    `- source: ${args.candidate.source}`,
    `- fitReason: ${args.candidate.fitReason}`,
    `- risk: ${args.candidate.risk}`,
    `- expected helpful lift (pct): ${args.candidate.expectedLift.helpfulRatePct}`,
    `- expected action completion lift (pct): ${args.candidate.expectedLift.actionCompletionRatePct}`,
    "",
    "Return strict JSON for decision and lift prediction. Use 0..1 scale for expectedHelpfulLift and expectedActionLift.",
  ].join("\n");
}

function extractResponseJsonText(response: unknown): string {
  const resp = response as { output_text?: unknown; output?: unknown[] };
  if (typeof resp.output_text === "string" && resp.output_text.trim()) {
    return resp.output_text;
  }

  const output = Array.isArray(resp.output) ? resp.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const it = item as { type?: unknown; content?: unknown };
    if (it.type !== "message" || !Array.isArray(it.content)) continue;
    for (const part of it.content) {
      if (!part || typeof part !== "object") continue;
      const p = part as { type?: unknown; text?: unknown };
      if (p.type === "output_text" && typeof p.text === "string" && p.text) {
        chunks.push(p.text);
      }
    }
  }

  return chunks.join("").trim();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (!/408|409|429|500|502|503|504/.test(message)) throw err;
      await sleep(400 * 2 ** (attempt - 1));
    }
  }
}

export async function discoverExternalSkillCandidates(args: {
  openaiApiKey: string;
  model: string;
  workspaceName: string;
  personaTrack: PersonaTrack;
  allowedSkillRefs: string[];
  profile: {
    websiteUrl?: string | null;
    description?: string | null;
    competitorDomains?: string[] | null;
  } | null;
  goals: Array<{ title: string; body?: string | null; priority: string }>;
  tasks: Array<{
    title: string;
    status: string;
    sourceType?: string | null;
    updatedAt?: Date;
  }>;
}): Promise<z.infer<typeof SkillDiscoveryOutputSchema>> {
  const client = new OpenAI({ apiKey: args.openaiApiKey });
  const input = buildSkillDiscoveryPrompt({
    workspaceName: args.workspaceName,
    personaTrack: args.personaTrack,
    allowedSkillRefs: args.allowedSkillRefs,
    profile: args.profile,
    goals: args.goals,
    tasks: args.tasks,
  });

  const response = await withRetry(
    async () =>
      client.responses.create({
        model: args.model,
        input,
        reasoning: { effort: "low" },
        tools: [
          {
            type: "web_search",
            filters: { allowed_domains: ["skills.sh"] },
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "skill_discovery_candidates",
            strict: true,
            schema: SkillDiscoveryOutputJsonSchema,
          },
        },
        max_output_tokens: 1200,
      }),
    3,
  );

  const raw = extractResponseJsonText(response);
  if (!raw.trim()) return { candidates: [] };

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error("Skill discovery returned non-JSON output.");
  }

  const parsed = SkillDiscoveryOutputSchema.parse(parsedJson);
  const deduped = new Map<string, (typeof parsed.candidates)[number]>();
  for (const candidate of parsed.candidates) {
    const key = candidate.skillRef.trim().toLowerCase();
    if (!key) continue;
    if (!deduped.has(key)) deduped.set(key, candidate);
  }

  return { candidates: Array.from(deduped.values()).slice(0, 5) };
}

export async function evaluateDiscoveredSkillCandidate(args: {
  openaiApiKey: string;
  model: string;
  workspaceName: string;
  personaTrack: PersonaTrack;
  personaSubmode: PersonaSubmode;
  goals: Array<{ title: string; body?: string | null; priority: string }>;
  tasks: Array<{
    title: string;
    status: string;
    sourceType?: string | null;
    updatedAt?: Date;
  }>;
  candidate: z.infer<typeof CandidateSchema>;
}): Promise<z.infer<typeof SkillEvaluatorOutputSchema>> {
  const client = new OpenAI({ apiKey: args.openaiApiKey });
  const input = buildGoalHelpfulnessEvaluatorPrompt({
    workspaceName: args.workspaceName,
    personaTrack: args.personaTrack,
    personaSubmode: args.personaSubmode,
    goals: args.goals,
    tasks: args.tasks,
    candidate: args.candidate,
  });

  const response = await withRetry(
    async () =>
      client.responses.create({
        model: args.model,
        input,
        reasoning: { effort: "low" },
        text: {
          format: {
            type: "json_schema",
            name: "goal_helpfulness_evaluator",
            strict: true,
            schema: SkillEvaluatorOutputJsonSchema,
          },
        },
        max_output_tokens: 500,
      }),
    3,
  );

  const raw = extractResponseJsonText(response);
  if (!raw.trim()) {
    throw new Error("Goal helpfulness evaluator returned empty output.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error("Goal helpfulness evaluator returned non-JSON output.");
  }

  return SkillEvaluatorOutputSchema.parse(parsedJson);
}
