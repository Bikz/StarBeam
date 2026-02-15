import type { PersonaTrack } from "./persona";

export type SkillSource = "CURATED" | "PARTNER";

export type InsightSkill = {
  ref: string;
  name: string;
  description: string;
  source: SkillSource;
  version: number;
  personas: PersonaTrack[];
};

type DistilledSkillInput = {
  ref: string;
  name: string;
  description: string;
  version?: number;
  personas?: PersonaTrack[];
};

const ALL_PERSONA_TRACKS: PersonaTrack[] = [
  "SOLO_FOUNDER",
  "SMALL_TEAM_5_10",
  "GROWTH_TEAM_11_50",
  "UNKNOWN",
];

const REGISTRY: InsightSkill[] = [
  {
    ref: "core-prioritization-v1",
    name: "Core Prioritization",
    description:
      "Prioritize recommendations by urgency, leverage, and confidence.",
    source: "CURATED",
    version: 1,
    personas: [
      "SOLO_FOUNDER",
      "SMALL_TEAM_5_10",
      "GROWTH_TEAM_11_50",
      "UNKNOWN",
    ],
  },
  {
    ref: "founder-gtm-rhythm-v1",
    name: "Founder GTM Rhythm",
    description:
      "Turn daily execution into demand-generation and customer learning loops.",
    source: "PARTNER",
    version: 1,
    personas: ["SOLO_FOUNDER", "SMALL_TEAM_5_10"],
  },
  {
    ref: "team-alignment-ops-v1",
    name: "Team Alignment Ops",
    description:
      "Improve planning quality, ownership clarity, and unblock delivery risks.",
    source: "PARTNER",
    version: 1,
    personas: ["SMALL_TEAM_5_10", "GROWTH_TEAM_11_50"],
  },
  {
    ref: "shipping-vs-marketing-balance-v1",
    name: "Shipping vs Marketing Balance",
    description:
      "Prevent pure-build drift by enforcing a distribution action every day.",
    source: "CURATED",
    version: 1,
    personas: ["SOLO_FOUNDER"],
  },
  {
    ref: "execution-review-loop-v1",
    name: "Execution Review Loop",
    description:
      "Use weekly review inputs to raise recommendation quality and follow-through.",
    source: "CURATED",
    version: 1,
    personas: ["SMALL_TEAM_5_10", "GROWTH_TEAM_11_50", "UNKNOWN"],
  },
  {
    ref: "jtbd-outcome-design-v1",
    name: "JTBD Outcome Design",
    description:
      "Translate signals into user jobs, desired outcomes, and concrete experiments.",
    source: "CURATED",
    version: 1,
    personas: [
      "SOLO_FOUNDER",
      "SMALL_TEAM_5_10",
      "GROWTH_TEAM_11_50",
      "UNKNOWN",
    ],
  },
  {
    ref: "rice-prioritization-v1",
    name: "RICE Prioritization",
    description:
      "Score candidate actions by reach, impact, confidence, and effort for better sequencing.",
    source: "CURATED",
    version: 1,
    personas: [
      "SOLO_FOUNDER",
      "SMALL_TEAM_5_10",
      "GROWTH_TEAM_11_50",
      "UNKNOWN",
    ],
  },
  {
    ref: "aarrr-growth-loops-v1",
    name: "AARRR Growth Loops",
    description:
      "Frame recommendations around acquisition, activation, retention, revenue, and referral loops.",
    source: "CURATED",
    version: 1,
    personas: ["SOLO_FOUNDER", "SMALL_TEAM_5_10", "GROWTH_TEAM_11_50"],
  },
  {
    ref: "positioning-messaging-v1",
    name: "Positioning and Messaging",
    description:
      "Improve clarity on audience, value proposition, and proof in outward-facing execution.",
    source: "CURATED",
    version: 1,
    personas: ["SOLO_FOUNDER", "SMALL_TEAM_5_10"],
  },
  {
    ref: "team-operating-cadence-v1",
    name: "Team Operating Cadence",
    description:
      "Strengthen planning rhythm, ownership clarity, dependency tracking, and weekly review quality.",
    source: "CURATED",
    version: 1,
    personas: ["SMALL_TEAM_5_10", "GROWTH_TEAM_11_50"],
  },
];

function parseDistilledSkillsFromEnv(): InsightSkill[] {
  const raw = (process.env.STARB_DISTILLED_SKILLS_JSON ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => item as DistilledSkillInput)
      .filter(
        (item) =>
          typeof item.ref === "string" &&
          typeof item.name === "string" &&
          typeof item.description === "string",
      )
      .map((item) => ({
        ref: item.ref.trim(),
        name: item.name.trim(),
        description: item.description.trim(),
        source: "CURATED" as const,
        version:
          typeof item.version === "number" && Number.isFinite(item.version)
            ? Math.max(1, Math.floor(item.version))
            : 1,
        personas:
          Array.isArray(item.personas) && item.personas.length
            ? item.personas
            : ALL_PERSONA_TRACKS,
      }))
      .filter((skill) => skill.ref.length > 0 && skill.name.length > 0);
  } catch {
    return [];
  }
}

export function getSkillRegistry(): InsightSkill[] {
  const distilled = parseDistilledSkillsFromEnv();
  if (!distilled.length) return REGISTRY.slice();

  const merged = new Map(REGISTRY.map((skill) => [skill.ref, skill]));
  for (const skill of distilled) {
    merged.set(skill.ref, skill);
  }
  return Array.from(merged.values());
}

export function skillsForPersona(persona: PersonaTrack): InsightSkill[] {
  return getSkillRegistry().filter((skill) => skill.personas.includes(persona));
}
