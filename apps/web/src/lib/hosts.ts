function stripPort(host: string): string {
  // "app.example.com:3000" -> "app.example.com"
  return host.split(":")[0]?.toLowerCase() ?? "";
}

export function isAppHost(hostHeader: string | null | undefined): boolean {
  const host = stripPort(String(hostHeader ?? ""));
  if (!host) return false;

  const explicit = (process.env.STARB_APP_HOST ?? "").trim().toLowerCase();
  if (explicit) return host === explicit;

  // Safe default: treat "app.*" as the app surface.
  return host.startsWith("app.");
}
