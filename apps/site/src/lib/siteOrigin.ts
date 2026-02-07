export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_ORIGIN || "http://localhost:3001";
  return raw.trim().replace(/\/+$/, "");
}

