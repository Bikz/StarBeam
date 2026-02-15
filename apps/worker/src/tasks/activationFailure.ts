export type ActivationFailureClass = "retriable" | "blocking";

const BLOCKING_PATTERNS: RegExp[] = [
  /missing google_client_id/i,
  /missing google_client_secret/i,
  /google oauth/i,
  /oauth .*misconfigured/i,
  /workspace not found/i,
  /target user is not a workspace member/i,
  /invalid .*payload/i,
];

const RETRIABLE_PATTERNS: RegExp[] = [
  /timeout/i,
  /tempor/i,
  /network/i,
  /connection/i,
  /429/,
  /5\d\d/,
  /rate/i,
  /retry/i,
];

export function summarizeActivationFailureReason(
  errorSummary: string | null | undefined,
): string {
  const summary = (errorSummary ?? "").trim();
  if (!summary) return "unknown";
  const firstLine = summary.split("\n")[0]?.trim() ?? "";
  if (!firstLine) return "unknown";
  return firstLine.slice(0, 180);
}

export function classifyActivationFailure(
  errorSummary: string | null | undefined,
): ActivationFailureClass {
  const summary = (errorSummary ?? "").trim();
  if (!summary) return "retriable";

  for (const pattern of BLOCKING_PATTERNS) {
    if (pattern.test(summary)) return "blocking";
  }

  for (const pattern of RETRIABLE_PATTERNS) {
    if (pattern.test(summary)) return "retriable";
  }

  return "retriable";
}
