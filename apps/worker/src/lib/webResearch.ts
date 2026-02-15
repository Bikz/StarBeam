import OpenAI from "openai";
import { z } from "zod";
import type { Tool, WebSearchTool } from "openai/resources/responses/responses";

const CitationSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
});

const WebInsightCardSchema = z.object({
  title: z.string(),
  body: z.string(),
  why: z.string(),
  action: z.string(),
  citations: z.array(CitationSchema).min(1).max(6),
});

const WebInsightOutputSchema = z.object({
  cards: z.array(WebInsightCardSchema).min(0).max(2),
});

type WebInsightCard = z.infer<typeof WebInsightCardSchema>;

type ToolSource = { url?: string; title?: string };
export type PromptCacheRetention = "in_memory" | "24h";

export type WebInsightUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

const WebInsightOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["cards"],
  properties: {
    cards: {
      type: "array",
      minItems: 0,
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "body", "why", "action", "citations"],
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          why: { type: "string" },
          action: { type: "string" },
          citations: {
            type: "array",
            minItems: 1,
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
        },
      },
    },
  },
} as const;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableError(err: unknown): boolean {
  const anyErr = err as { status?: number; code?: string };
  const status = typeof anyErr?.status === "number" ? anyErr.status : undefined;
  if (status && [408, 409, 429, 500, 502, 503, 504].includes(status))
    return true;
  const code = typeof anyErr?.code === "string" ? anyErr.code : "";
  if (code && ["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"].includes(code))
    return true;
  return false;
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt >= maxAttempts || !isRetryableError(err)) throw err;
      const delay = 500 * 2 ** (attempt - 1);
      await sleep(delay);
    }
  }
}

function extractToolSources(response: unknown): ToolSource[] {
  const r = response as { output?: unknown[] };
  const output = Array.isArray(r?.output) ? r.output : [];
  const sources: ToolSource[] = [];

  for (const item of output) {
    const it = item as { type?: unknown; action?: unknown };
    if (it?.type !== "web_search_call") continue;

    const action = it.action as { sources?: unknown };
    if (!action?.sources || !Array.isArray(action.sources)) continue;

    for (const s of action.sources) {
      if (!s || typeof s !== "object") continue;
      const ss = s as ToolSource;
      sources.push({ url: ss.url, title: ss.title });
    }
  }

  return sources;
}

function refusalMessage(response: unknown): string | null {
  const r = response as { output?: unknown[] };
  const output = Array.isArray(r?.output) ? r.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const it = item as { type?: unknown; content?: unknown };
    if (it.type !== "message" || !Array.isArray(it.content)) continue;
    for (const part of it.content) {
      if (!part || typeof part !== "object") continue;
      const p = part as { type?: unknown; refusal?: unknown };
      if (p.type === "refusal" && typeof p.refusal === "string") {
        return p.refusal.trim() || "refused";
      }
    }
  }
  return null;
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

function normalizeUrl(url: string): string {
  // Keep it simple: drop trailing slash for stable matching.
  return url.replace(/\/$/, "");
}

function filterCitationsToSources(
  cards: WebInsightCard[],
  sources: ToolSource[],
): WebInsightCard[] {
  const sourceUrls = new Set(
    sources
      .map((s) => (typeof s.url === "string" ? normalizeUrl(s.url) : ""))
      .filter(Boolean),
  );

  // If the SDK doesn't return sources for the web_search tool call (or types drift),
  // don't drop citations. The model output already includes its own citations list.
  if (sourceUrls.size === 0) return cards;

  return cards
    .map((c) => {
      const citations = c.citations.filter((cit) =>
        sourceUrls.has(normalizeUrl(cit.url)),
      );
      return { ...c, citations };
    })
    .filter((c) => c.citations.length > 0);
}

export async function generateWebInsights({
  openaiApiKey,
  model,
  input,
  allowedDomains,
  promptCacheKey,
  promptCacheRetention,
}: {
  openaiApiKey: string;
  model: string;
  input: string;
  allowedDomains?: string[];
  promptCacheKey?: string;
  promptCacheRetention?: PromptCacheRetention;
}): Promise<{
  cards: WebInsightCard[];
  toolSources: ToolSource[];
  usage?: WebInsightUsage;
}> {
  const client = new OpenAI({ apiKey: openaiApiKey });

  const tools: Tool[] = [
    allowedDomains?.length
      ? ({
          type: "web_search",
          filters: { allowed_domains: allowedDomains },
        } satisfies WebSearchTool)
      : ({ type: "web_search" } satisfies WebSearchTool),
  ];

  const response = await withRetry(
    async () =>
      client.responses.create({
        model,
        reasoning: { effort: "low" },
        tools,
        tool_choice: "auto",
        input,
        max_output_tokens: 1200,
        ...(promptCacheKey ? { prompt_cache_key: promptCacheKey } : {}),
        ...(promptCacheRetention
          ? { prompt_cache_retention: promptCacheRetention }
          : {}),
        text: {
          format: {
            type: "json_schema",
            name: "web_insight_output",
            strict: true,
            schema: WebInsightOutputJsonSchema,
          },
        },
      }),
    3,
  );

  const status = (response as { status?: unknown }).status;
  if (status === "incomplete") {
    const reason =
      (
        response as {
          incomplete_details?: { reason?: unknown } | null;
        }
      ).incomplete_details?.reason ?? "unknown";
    throw new Error(`Web insight response incomplete (${String(reason)}).`);
  }

  const refusal = refusalMessage(response);
  if (refusal) {
    throw new Error(`Web insight response refused: ${refusal}`);
  }

  const toolSources = extractToolSources(response);
  const usageRaw = (
    response as {
      usage?: {
        input_tokens?: unknown;
        output_tokens?: unknown;
        input_tokens_details?: { cached_tokens?: unknown } | null;
      };
    }
  ).usage;
  const usage =
    usageRaw && typeof usageRaw === "object"
      ? {
          inputTokens:
            typeof usageRaw.input_tokens === "number"
              ? usageRaw.input_tokens
              : 0,
          cachedInputTokens:
            typeof usageRaw.input_tokens_details?.cached_tokens === "number"
              ? usageRaw.input_tokens_details.cached_tokens
              : 0,
          outputTokens:
            typeof usageRaw.output_tokens === "number"
              ? usageRaw.output_tokens
              : 0,
        }
      : undefined;

  const rawText = extractResponseJsonText(response);
  if (!rawText.trim()) {
    return { cards: [], toolSources, ...(usage ? { usage } : {}) };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    throw new Error("Model returned non-JSON output for web insights.");
  }

  const parsed = WebInsightOutputSchema.parse(parsedJson);
  const cards = filterCitationsToSources(parsed.cards ?? [], toolSources);

  return { cards, toolSources, ...(usage ? { usage } : {}) };
}

export function buildDepartmentWebResearchPrompt(args: {
  workspaceName: string;
  websiteUrl?: string | null;
  description?: string | null;
  competitorDomains?: string[];
  departmentName: string;
  departmentPromptTemplate?: string;
  goals: Array<{ title: string; body: string; priority: string }>;
}): string {
  const competitors = (args.competitorDomains ?? [])
    .filter(Boolean)
    .slice(0, 10);
  const goals = args.goals.slice(0, 5);

  return [
    "You are Starbeam, an enterprise pulse agent.",
    "",
    "Task: Search the web for credible, recent (last 72 hours) signals relevant to this department and its goals.",
    "Output must be STRICT JSON (no markdown). Only include claims that are supported by the citations you provide.",
    "No numbers unless they are explicitly supported by a cited source.",
    "",
    `Company: ${args.workspaceName}`,
    args.websiteUrl ? `Website: ${args.websiteUrl}` : "",
    args.description ? `Description: ${args.description}` : "",
    competitors.length ? `Competitors: ${competitors.join(", ")}` : "",
    "",
    `Department: ${args.departmentName}`,
    args.departmentPromptTemplate?.trim()
      ? `Department prompt:\\n${args.departmentPromptTemplate.trim()}`
      : "",
    "",
    "Active goals:",
    ...goals.map((g, i) => {
      const body = g.body?.trim() ? ` - ${g.body.trim()}` : "";
      return `${i + 1}. (${g.priority}) ${g.title}${body}`;
    }),
    "",
    "Return up to 2 cards. Each card must have at least 1 citation URL (2 is better).",
    "Each card should be direct and actionable in a playful enterprise tone.",
    "",
    "Schema:",
    JSON.stringify(
      {
        cards: [
          {
            title: "string",
            body: "string (2-4 lines)",
            why: "string (1-2 sentences)",
            action: "string (1-2 sentences, copy-only)",
            citations: [{ url: "https://...", title: "string" }],
          },
        ],
      },
      null,
      2,
    ),
  ]
    .filter((s) => s !== "")
    .join("\\n");
}
