import { PrismaClient } from "@prisma/client";
export { Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __starbeam_prisma__: PrismaClient | undefined;
}

function getDatabaseUrl(): string {
  const url =
    process.env.DATABASE_URL ??
    process.env.STARB_DATABASE_URL ??
    process.env.DIRECT_DATABASE_URL;

  if (url) return url;

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
