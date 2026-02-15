import { prisma } from "@starbeam/db";

export const INSIGHT_MANUAL_CONTROLS_KEY = "insight_manual_controls_v1";
const MAX_DISABLED_SKILL_REFS = 100;

export type InsightManualControls = {
  discoveredSkillExecutionEnabled: boolean;
  disabledSkillRefs: string[];
};

export const defaultInsightManualControls: InsightManualControls = {
  discoveredSkillExecutionEnabled: true,
  disabledSkillRefs: [],
};

function normalizeSkillRefs(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(normalized)).slice(0, MAX_DISABLED_SKILL_REFS);
}

export function parseInsightManualControls(
  cursor: string | null | undefined,
): InsightManualControls {
  if (!cursor) return { ...defaultInsightManualControls };
  try {
    const parsed = JSON.parse(cursor) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...defaultInsightManualControls };
    }
    const record = parsed as Record<string, unknown>;
    return {
      discoveredSkillExecutionEnabled:
        typeof record.discoveredSkillExecutionEnabled === "boolean"
          ? record.discoveredSkillExecutionEnabled
          : defaultInsightManualControls.discoveredSkillExecutionEnabled,
      disabledSkillRefs: normalizeSkillRefs(record.disabledSkillRefs),
    };
  } catch {
    return { ...defaultInsightManualControls };
  }
}

export async function loadInsightManualControls(): Promise<InsightManualControls> {
  const state = await prisma.schedulerState.findUnique({
    where: { key: INSIGHT_MANUAL_CONTROLS_KEY },
    select: { cursor: true },
  });
  return parseInsightManualControls(state?.cursor);
}

export async function saveInsightManualControls(
  controls: InsightManualControls,
): Promise<void> {
  await prisma.schedulerState.upsert({
    where: { key: INSIGHT_MANUAL_CONTROLS_KEY },
    update: {
      cursor: JSON.stringify({
        discoveredSkillExecutionEnabled:
          controls.discoveredSkillExecutionEnabled,
        disabledSkillRefs: normalizeSkillRefs(controls.disabledSkillRefs),
      }),
    },
    create: {
      key: INSIGHT_MANUAL_CONTROLS_KEY,
      cursor: JSON.stringify({
        discoveredSkillExecutionEnabled:
          controls.discoveredSkillExecutionEnabled,
        disabledSkillRefs: normalizeSkillRefs(controls.disabledSkillRefs),
      }),
    },
  });
}

export function parseDisabledSkillRefsInput(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\n,]/g)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, MAX_DISABLED_SKILL_REFS);
}
