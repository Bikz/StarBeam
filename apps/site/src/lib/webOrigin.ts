export function webOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_WEB_ORIGIN || "http://localhost:3000";
  return raw.trim().replace(/\/+$/, "");
}
