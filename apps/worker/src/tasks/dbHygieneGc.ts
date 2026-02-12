import { prisma } from "@starbeam/db";

function parseIntEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

async function deleteRateLimitBuckets(args: {
  cutoff: Date;
  batch: number;
}): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await prisma.rateLimitBucket.findMany({
      where: { windowStart: { lt: args.cutoff } },
      select: { id: true },
      orderBy: { windowStart: "asc" },
      take: args.batch,
    });
    if (rows.length === 0) return;

    await prisma.rateLimitBucket.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });

    if (rows.length < args.batch) return;
  }
}

async function deleteEmailLoginCodes(args: {
  cutoff: Date;
  batch: number;
}): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await prisma.emailLoginCode.findMany({
      where: { expiresAt: { lt: args.cutoff } },
      select: { id: true },
      orderBy: { expiresAt: "asc" },
      take: args.batch,
    });
    if (rows.length === 0) return;

    await prisma.emailLoginCode.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });

    if (rows.length < args.batch) return;
  }
}

async function deleteDeviceAuthRequests(args: {
  cutoff: Date;
  batch: number;
}): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await prisma.deviceAuthRequest.findMany({
      where: { expiresAt: { lt: args.cutoff } },
      select: { id: true },
      orderBy: { expiresAt: "asc" },
      take: args.batch,
    });
    if (rows.length === 0) return;

    await prisma.deviceAuthRequest.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });

    if (rows.length < args.batch) return;
  }
}

async function deleteApiRefreshTokens(args: {
  cutoff: Date;
  batch: number;
}): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await prisma.apiRefreshToken.findMany({
      where: {
        OR: [
          { expiresAt: { lt: args.cutoff } },
          { revokedAt: { not: null, lt: args.cutoff } },
        ],
      },
      select: { id: true },
      orderBy: [{ revokedAt: "asc" }, { expiresAt: "asc" }],
      take: args.batch,
    });
    if (rows.length === 0) return;

    await prisma.apiRefreshToken.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });

    if (rows.length < args.batch) return;
  }
}

export async function db_hygiene_gc(): Promise<void> {
  const retentionDays = Math.max(
    1,
    parseIntEnv("STARB_DB_GC_RETENTION_DAYS", 30),
  );
  const batch = Math.min(
    5000,
    Math.max(100, parseIntEnv("STARB_DB_GC_BATCH", 1000)),
  );

  const now = new Date();
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  await deleteRateLimitBuckets({ cutoff, batch });
  await deleteEmailLoginCodes({ cutoff, batch });
  await deleteDeviceAuthRequests({ cutoff, batch });
  await deleteApiRefreshTokens({ cutoff, batch });
}
