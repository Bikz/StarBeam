import type { PersonaSubmode, PersonaTrack } from "./persona";

export type InsightMeta = {
  personaTrack: PersonaTrack;
  personaSubmode?: PersonaSubmode;
  skillRef?: string;
  skillOrigin?: "CURATED" | "PARTNER" | "DISCOVERED";
  expectedHelpfulLift?: number;
  expectedActionLift?: number;
  relevanceScore: number;
  actionabilityScore: number;
  confidenceScore: number;
  noveltyScore: number;
};

export type RankableInsightCard<TCard> = {
  card: TCard;
  title: string;
  kind: string;
  insightMeta: InsightMeta;
};

type Ranked<TCard> = RankableInsightCard<TCard> & {
  finalScore: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function titleKey(title: string): string {
  return title.trim().toLowerCase();
}

function normalizeRateTo01(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value <= 1) return clamp01(value);
  return clamp01(value / 100);
}

function computeBaseScore(meta: InsightMeta): number {
  return clamp01(
    clamp01(meta.relevanceScore) * 0.35 +
      clamp01(meta.actionabilityScore) * 0.3 +
      clamp01(meta.confidenceScore) * 0.2 +
      clamp01(meta.noveltyScore) * 0.15,
  );
}

function computeFinalScore(args: {
  meta: InsightMeta;
  priorHelpfulRatePct?: number;
  priorActionCompletionRatePct?: number;
  hybridLearningEnabled: boolean;
}): number {
  const base = computeBaseScore(args.meta);
  if (!args.hybridLearningEnabled) return base;

  const priorHelpful = normalizeRateTo01(args.priorHelpfulRatePct);
  const priorAction = normalizeRateTo01(args.priorActionCompletionRatePct);
  if (priorHelpful === 0 && priorAction === 0) return base;

  return clamp01(base * 0.75 + priorHelpful * 0.15 + priorAction * 0.1);
}

export function normalizeInsightMeta(
  meta: Partial<InsightMeta> & { personaTrack: PersonaTrack },
): InsightMeta {
  return {
    personaTrack: meta.personaTrack,
    ...(meta.personaSubmode ? { personaSubmode: meta.personaSubmode } : {}),
    ...(meta.skillRef ? { skillRef: meta.skillRef } : {}),
    ...(meta.skillOrigin ? { skillOrigin: meta.skillOrigin } : {}),
    ...(typeof meta.expectedHelpfulLift === "number"
      ? { expectedHelpfulLift: clamp01(meta.expectedHelpfulLift) }
      : {}),
    ...(typeof meta.expectedActionLift === "number"
      ? { expectedActionLift: clamp01(meta.expectedActionLift) }
      : {}),
    relevanceScore: clamp01(meta.relevanceScore ?? 0.7),
    actionabilityScore: clamp01(meta.actionabilityScore ?? 0.7),
    confidenceScore: clamp01(meta.confidenceScore ?? 0.6),
    noveltyScore: clamp01(meta.noveltyScore ?? 0.5),
  };
}

export function rankInsightCards<TCard>(args: {
  cards: Array<RankableInsightCard<TCard>>;
  explorationPct?: number;
  seed?: string;
  hybridLearning?: {
    enabled: boolean;
    priorBySkillRef?: Record<
      string,
      { helpfulRatePct: number; actionCompletionRatePct: number }
    >;
    priorBySubmode?: Record<
      string,
      { helpfulRatePct: number; actionCompletionRatePct: number }
    >;
  };
}): Array<RankableInsightCard<TCard>> {
  const explorationPct = clamp01(args.explorationPct ?? 0.2);
  const seed = args.seed ?? "";

  // Dedupe by normalized title, keeping best score.
  const deduped = new Map<string, Ranked<TCard>>();
  for (const item of args.cards) {
    const priorFromSkill =
      item.insightMeta.skillRef && args.hybridLearning?.priorBySkillRef
        ? args.hybridLearning.priorBySkillRef[item.insightMeta.skillRef]
        : undefined;
    const priorFromSubmode =
      item.insightMeta.personaSubmode && args.hybridLearning?.priorBySubmode
        ? args.hybridLearning.priorBySubmode[item.insightMeta.personaSubmode]
        : undefined;

    const scored: Ranked<TCard> = {
      ...item,
      finalScore: computeFinalScore({
        meta: item.insightMeta,
        priorHelpfulRatePct:
          priorFromSkill?.helpfulRatePct ?? priorFromSubmode?.helpfulRatePct,
        priorActionCompletionRatePct:
          priorFromSkill?.actionCompletionRatePct ??
          priorFromSubmode?.actionCompletionRatePct,
        hybridLearningEnabled: Boolean(args.hybridLearning?.enabled),
      }),
    };
    const key = titleKey(item.title);
    const prev = deduped.get(key);
    if (!prev || scored.finalScore > prev.finalScore) {
      deduped.set(key, scored);
    }
  }

  const sorted = Array.from(deduped.values()).sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return a.title.localeCompare(b.title);
  });

  if (sorted.length <= 1 || explorationPct <= 0) {
    return sorted.map((item) => ({
      card: item.card,
      title: item.title,
      kind: item.kind,
      insightMeta: item.insightMeta,
    }));
  }

  const explorationCount = Math.max(
    1,
    Math.floor(sorted.length * explorationPct),
  );
  const exploitCount = Math.max(1, sorted.length - explorationCount);
  const exploit = sorted.slice(0, exploitCount);
  const remaining = sorted.slice(exploitCount);

  const exploration = remaining
    .slice()
    .sort((a, b) => {
      const aPick =
        stableHash(`${seed}:${a.title}:${a.kind}`) + a.insightMeta.noveltyScore;
      const bPick =
        stableHash(`${seed}:${b.title}:${b.kind}`) + b.insightMeta.noveltyScore;
      if (bPick !== aPick) return bPick - aPick;
      return a.title.localeCompare(b.title);
    })
    .slice(0, explorationCount);

  const merged = [...exploit, ...exploration].sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return a.title.localeCompare(b.title);
  });

  return merged.map((item) => ({
    card: item.card,
    title: item.title,
    kind: item.kind,
    insightMeta: item.insightMeta,
  }));
}
