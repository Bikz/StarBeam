import assert from "node:assert/strict";
import test from "node:test";

test("db package exports a Prisma client", async () => {
  const mod = await import("../src/index.ts");

  assert.ok(mod.prisma, "expected prisma export");
  assert.equal(typeof mod.prisma.$connect, "function");
  assert.equal(typeof mod.prisma.$disconnect, "function");
});
