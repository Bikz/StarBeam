function isTruthy(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(
    (value ?? "").trim().toLowerCase(),
  );
}

export function isContextSplitEnabled(): boolean {
  if (process.env.STARB_CONTEXT_SPLIT_V1 === undefined) return true;
  return isTruthy(process.env.STARB_CONTEXT_SPLIT_V1);
}
