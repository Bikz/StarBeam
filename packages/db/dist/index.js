// src/index.ts
import { PrismaClient } from "@prisma/client";
var prisma = globalThis.__starbeam_prisma__ ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
});
if (process.env.NODE_ENV !== "production") {
  globalThis.__starbeam_prisma__ = prisma;
}
export {
  prisma
};
