export function safeRedirectPath(
  candidate: string | null | undefined,
  fallback: string,
): string {
  const value = typeof candidate === "string" ? candidate.trim() : "";
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  // Prevent protocol-relative redirects like `//evil.com`.
  if (value.startsWith("//")) return fallback;
  // Avoid surprising backslash handling in user agents and proxies.
  if (value.includes("\\")) return fallback;
  // Drop control characters.
  if (/[\u0000-\u001F\u007F]/.test(value)) return fallback;
  return value;
}
