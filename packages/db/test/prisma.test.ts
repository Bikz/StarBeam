import assert from "node:assert/strict";
import test from "node:test";

test("db package exports a Prisma client", async () => {
  // Prisma 7 + driver adapter requires a DATABASE_URL at init time. Tests don't
  // need a real DB connection; a well-formed URL is enough.
  process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/starbeam";
  process.env.DIRECT_DATABASE_URL ??=
    "postgresql://user:pass@localhost:5432/starbeam";

  const mod = await import("../src/index.ts");

  assert.ok(mod.prisma, "expected prisma export");
  assert.equal(typeof mod.prisma.$connect, "function");
  assert.equal(typeof mod.prisma.$disconnect, "function");
});
