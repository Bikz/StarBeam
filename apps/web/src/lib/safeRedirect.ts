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
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return fallback;
  }
  return value;
}
