export type PersonaTrack =
  | "SOLO_FOUNDER"
  | "SMALL_TEAM_5_10"
  | "GROWTH_TEAM_11_50"
  | "UNKNOWN";

export type PersonaSubmode =
  | "SHIP_HEAVY"
  | "GTM_HEAVY"
  | "ALIGNMENT_GAP"
  | "EXECUTION_DRIFT"
  | "UNKNOWN";

export type PersonaInput = {
  memberCount: number;
  activeMemberCount: number;
  integrationCount: number;
  openTaskCount: number;
  hasPersonalProfile: boolean;
  hasGoals: boolean;
};

export type PersonaSubmodeInput = {
  personaTrack: PersonaTrack;
  activeMemberCount: number;
  integrationCount: number;
  openTaskCount: number;
  hasGoals: boolean;
};

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function classifyPersonaTrack(input: PersonaInput): PersonaTrack {
  const members = clampNonNegative(input.memberCount);
  const active = clampNonNegative(input.activeMemberCount);

  const teamSize = Math.max(members, active);

  if (teamSize >= 11 && teamSize <= 50) return "GROWTH_TEAM_11_50";
  if (teamSize >= 5 && teamSize <= 10) return "SMALL_TEAM_5_10";

  // Small teams that still look founder-led default to SOLO_FOUNDER.
  if (teamSize >= 1 && teamSize <= 4) return "SOLO_FOUNDER";

  // Fallback from behavioral hints when membership data is sparse.
  if (input.openTaskCount > 0 && input.integrationCount <= 1) {
    return "SOLO_FOUNDER";
  }
  if (input.integrationCount >= 3 && input.hasGoals) {
    return "SMALL_TEAM_5_10";
  }

  return "UNKNOWN";
}

export function recommendedFocusForPersona(persona: PersonaTrack): string {
  if (persona === "SOLO_FOUNDER") {
    return "Balance shipping with distribution. Ship one concrete marketing action each day.";
  }
  if (persona === "SMALL_TEAM_5_10") {
    return "Align weekly priorities across owners and remove cross-team blockers early.";
  }
  if (persona === "GROWTH_TEAM_11_50") {
    return "Improve execution cadence with clear ownership, dependencies, and measurable outcomes.";
  }
  return "Prioritize the highest-leverage action and close the loop on outcomes.";
}

export function classifyPersonaSubmode(
  input: PersonaSubmodeInput,
): PersonaSubmode {
  const activeMembers = clampNonNegative(input.activeMemberCount);
  const openTaskCount = clampNonNegative(input.openTaskCount);
  const integrationCount = clampNonNegative(input.integrationCount);

  if (
    input.personaTrack === "SMALL_TEAM_5_10" ||
    input.personaTrack === "GROWTH_TEAM_11_50"
  ) {
    if (activeMembers >= 5 && (!input.hasGoals || integrationCount <= 1)) {
      return "ALIGNMENT_GAP";
    }
    if (input.hasGoals && openTaskCount >= 8) {
      return "EXECUTION_DRIFT";
    }
  }

  if (openTaskCount >= 4 && integrationCount <= 1) {
    return "SHIP_HEAVY";
  }
  if (input.hasGoals && integrationCount >= 2 && openTaskCount <= 3) {
    return "GTM_HEAVY";
  }
  if (input.hasGoals && openTaskCount >= 5) {
    return "EXECUTION_DRIFT";
  }

  return "UNKNOWN";
}

export function whyThisTodayForPersonaSubmode(args: {
  personaTrack: PersonaTrack;
  personaSubmode: PersonaSubmode;
}): string {
  if (args.personaSubmode === "SHIP_HEAVY") {
    return "You are shipping quickly; pair that momentum with one concrete distribution step today.";
  }
  if (args.personaSubmode === "GTM_HEAVY") {
    return "Your context shows strong go-to-market intent; prioritize the smallest experiment with a measurable outcome.";
  }
  if (args.personaSubmode === "ALIGNMENT_GAP") {
    return "Team signals indicate alignment risk; make ownership and next milestones explicit across collaborators.";
  }
  if (args.personaSubmode === "EXECUTION_DRIFT") {
    return "Execution appears fragmented; focus on one high-leverage action and close the loop before adding new work.";
  }
  return recommendedFocusForPersona(args.personaTrack);
}
