import type { ProviderCheckErr } from "./providerCheck";

export type ProviderId = "github" | "linear" | "notion";

export function friendlyProviderError(
  provider: ProviderId,
  err: ProviderCheckErr,
): string {
  const name =
    provider === "github"
      ? "GitHub"
      : provider === "linear"
        ? "Linear"
        : "Notion";

  if (err.code === "unauthorized") {
    return `${name} didn’t accept that token. Create a new token and try again.`;
  }

  if (err.code === "forbidden") {
    return `${name} accepted the token, but it doesn’t have access to what Starbeam needs. Create a new token with the right access and try again.`;
  }

  if (err.code === "invalid") {
    return `${name} returned an unexpected response. Create a new token and try again.`;
  }

  return `Could not connect ${name}. Please try again.`;
}
