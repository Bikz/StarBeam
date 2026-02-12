import { PrismaClient } from "@prisma/client";
export { Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __starbeam_prisma__: PrismaClient | undefined;
}

function isTruthyEnv(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes((value ?? "").trim().toLowerCase());
}

function isLocalDatabaseHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  if (host === "localhost" || host === "::1") return true;
  if (host === "host.docker.internal") return true;
  if (host.endsWith(".localhost")) return true;
  if (host === "postgres" || host === "db") return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

function assertSafeDatabaseUrl(args: {
  databaseUrl: string;
  nodeEnv?: string;
  allowRemote?: string;
}): void {
  if ((args.nodeEnv ?? "").trim().toLowerCase() === "production") return;
  if (isTruthyEnv(args.allowRemote)) return;

  try {
    const parsed = new URL(args.databaseUrl);
    if (isLocalDatabaseHost(parsed.hostname)) return;
  } catch {
    // fallthrough
  }

  throw new Error(
    "Refusing to use a non-local DATABASE_URL in non-production. Set STARB_ALLOW_REMOTE_DB=1 to override.",
  );
}

function getDatabaseUrl(): string {
  const url =
    process.env.DATABASE_URL ??
    process.env.STARB_DATABASE_URL ??
    process.env.DIRECT_DATABASE_URL;

  if (url) {
    assertSafeDatabaseUrl({
      databaseUrl: url,
      nodeEnv: process.env.NODE_ENV,
      allowRemote: process.env.STARB_ALLOW_REMOTE_DB,
    });
    return url;
  }

  // Allow importing the db package in unit tests / tooling without forcing a DB.
  // In production we want a hard failure so misconfig is loud and immediate.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is required to initialize Prisma. Set DATABASE_URL (runtime) and DIRECT_DATABASE_URL (migrations/CLI).",
    );
  }

  return "postgresql://user:pass@localhost:5432/starbeam";
}

export const prisma: PrismaClient =
  globalThis.__starbeam_prisma__ ??
  new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: getDatabaseUrl() })),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__starbeam_prisma__ = prisma;
}
