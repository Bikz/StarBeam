import type { InsightSkill } from "./skillRegistry";

type ProgramType = "NONE" | "DESIGN_PARTNER";

export function allowPartnerSkills(args: {
  programType: ProgramType;
  partnerSkillsFlagEnabled: boolean;
}): boolean {
  if (!args.partnerSkillsFlagEnabled) return false;
  // Keep partner skills constrained to design-partner cohort in this wave.
  return args.programType === "DESIGN_PARTNER";
}

export function applySkillPolicy(args: {
  skills: InsightSkill[];
  includePartnerSkills: boolean;
  maxSkills?: number;
}): InsightSkill[] {
  const maxSkills =
    typeof args.maxSkills === "number" && Number.isFinite(args.maxSkills)
      ? Math.max(1, Math.floor(args.maxSkills))
      : 3;

  const filtered = args.skills.filter((skill) => {
    if (skill.source === "PARTNER" && !args.includePartnerSkills) return false;
    return true;
  });

  return filtered.slice(0, maxSkills);
}

export type EvaluatedDiscoveredSkill = {
  skillRef: string;
  source: "curated" | "partner" | "external";
  fitReason: string;
  risk: "low" | "medium" | "high";
  expectedHelpfulLift: number;
  expectedActionLift: number;
  confidence: number;
  decision: "USE" | "SKIP";
};

export function shouldUseDiscoveredSkill(
  candidate: EvaluatedDiscoveredSkill,
): boolean {
  if (candidate.decision !== "USE") return false;
  if (candidate.risk === "high") return false;
  if (candidate.expectedHelpfulLift < 0.1) return false;
  if (candidate.confidence < 0.6) return false;
  return true;
}
