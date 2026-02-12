type HeaderLike = { get(name: string): string | null };

function isAsciiToken(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x21 || code > 0x7e) return false;
  }
  return true;
}

export function requestIdFromHeaders(headers: HeaderLike): string | null {
  const raw = (headers.get("x-request-id") ?? "").trim();
  if (!raw) return null;
  if (raw.length > 128) return null;
  if (!isAsciiToken(raw)) return null;
  return raw;
}
