function isTruthyEnv(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes((value ?? "").trim().toLowerCase());
}

export function databaseHostFromUrl(databaseUrl: string): string | null {
  const raw = databaseUrl.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.trim().toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

export function isLocalDatabaseHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;

  if (host === "localhost" || host === "::1") return true;
  if (host === "host.docker.internal") return true;
  if (host.endsWith(".localhost")) return true;

  // Common local docker-compose service names.
  if (host === "postgres" || host === "db") return true;

  // Loopback IPv4 range.
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;

  return false;
}

export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  const host = databaseHostFromUrl(databaseUrl);
  if (!host) return false;
  return isLocalDatabaseHost(host);
}

export function assertSafeDatabaseUrl(args: {
  databaseUrl: string;
  nodeEnv?: string;
  allowRemote?: string;
  source?: string;
}): void {
  if ((args.nodeEnv ?? "").trim().toLowerCase() === "production") return;
  if (isTruthyEnv(args.allowRemote)) return;
  if (isLocalDatabaseUrl(args.databaseUrl)) return;

  const source = args.source ? `${args.source}: ` : "";
  throw new Error(
    `${source}Refusing to use a non-local DATABASE_URL in non-production. Set STARB_ALLOW_REMOTE_DB=1 to override.`,
  );
}
