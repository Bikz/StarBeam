export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_ORIGIN || "https://starbeamhq.com";
  return raw.trim().replace(/\/+$/, "");
}
