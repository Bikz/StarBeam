import { prisma } from "@starbeam/db";

import { deleteObjectIfConfigured } from "../lib/blobStore";

function parseIntEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

export async function blob_gc(): Promise<void> {
  const graceDays = Math.max(1, parseIntEnv("STARB_BLOB_GC_GRACE_DAYS", 14));
  const batch = Math.min(
    1000,
    Math.max(1, parseIntEnv("STARB_BLOB_GC_BATCH", 200)),
  );

  const now = new Date();
  const cutoff = new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000);

  const doomed = await prisma.blob.findMany({
    where: { deletedAt: { not: null, lte: cutoff } },
    select: { id: true, bucket: true, key: true },
    orderBy: { deletedAt: "asc" },
    take: batch,
  });

  if (doomed.length === 0) return;

  // Best-effort deletes in blob store, but do NOT drop DB rows unless the delete
  // call succeeded (otherwise we'd lose the ability to retry in future GC runs).
  for (const b of doomed) {
    const ok = await deleteObjectIfConfigured({ bucket: b.bucket, key: b.key });
    if (!ok) continue;
    await prisma.blob.delete({ where: { id: b.id } }).catch(() => undefined);
  }
}
