type HeaderLike = { get(name: string): string | null };

export function clientIpFromHeaders(headers: HeaderLike): string {
  const xf = headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() ?? "";

  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();

  const xrip = headers.get("x-real-ip");
  if (xrip) return xrip.trim();

  return "";
}
