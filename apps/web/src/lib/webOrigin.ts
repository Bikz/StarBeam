export function webOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_WEB_ORIGIN ||
    process.env.AUTH_URL ||
    "http://localhost:3000";

  // Environment values can pick up trailing whitespace/newlines (e.g. from CLIs).
  // That breaks redirects because `Location` header values must be valid URLs.
  return raw.trim().replace(/\/+$/, "");
}
