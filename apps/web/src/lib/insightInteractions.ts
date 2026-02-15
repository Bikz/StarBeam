export const insightInteractionTypes = [
  "VIEWED",
  "SOURCE_OPENED",
  "COPIED",
  "MARKED_DONE",
  "HELPFUL",
  "NOT_HELPFUL",
] as const;

export type InsightInteractionType = (typeof insightInteractionTypes)[number];

export function normalizeInsightReasonCode(
  value: string | null | undefined,
): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  const normalized = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);

  return normalized || null;
}
