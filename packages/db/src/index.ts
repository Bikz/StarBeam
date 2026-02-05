import { PrismaClient } from "@prisma/client";
export { Prisma } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __starbeam_prisma__: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__starbeam_prisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__starbeam_prisma__ = prisma;
}
