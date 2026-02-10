import { prisma } from "@starbeam/db";

import { putEncryptedObject } from "../blobStore";

function ymdUtc(d: Date): string {
  // ISO date is always YYYY-MM-DD at the start.
  return d.toISOString().slice(0, 10);
}

export async function persistCodexMemory(args: {
  workspaceId: string;
  userId: string;
  editionDate: Date;
  baseMarkdown: string;
  dailyMarkdown: string;
}): Promise<{ baseKey: string; dailyKey: string }> {
  const date = ymdUtc(args.editionDate);

  const baseKey = `workspaces/${args.workspaceId}/users/${args.userId}/codex-memory/base/${date}.md`;
  const dailyKey = `workspaces/${args.workspaceId}/users/${args.userId}/codex-memory/daily/${date}.md`;

  const [baseStored, dailyStored] = await Promise.all([
    putEncryptedObject({
      key: baseKey,
      contentType: "text/markdown",
      plaintext: Buffer.from(args.baseMarkdown, "utf8"),
    }),
    putEncryptedObject({
      key: dailyKey,
      contentType: "text/markdown",
      plaintext: Buffer.from(args.dailyMarkdown, "utf8"),
    }),
  ]);

  await Promise.all([
    prisma.blob.upsert({
      where: { bucket_key: { bucket: baseStored.bucket, key: baseStored.key } },
      update: {
        workspaceId: args.workspaceId,
        ownerUserId: args.userId,
        contentType: "text/markdown",
        sizeBytes: baseStored.sizeBytes,
        sha256: baseStored.sha256,
        encryption: baseStored.encryption,
        deletedAt: null,
      },
      create: {
        workspaceId: args.workspaceId,
        ownerUserId: args.userId,
        bucket: baseStored.bucket,
        key: baseStored.key,
        contentType: "text/markdown",
        sizeBytes: baseStored.sizeBytes,
        sha256: baseStored.sha256,
        encryption: baseStored.encryption,
      },
    }),
    prisma.blob.upsert({
      where: {
        bucket_key: { bucket: dailyStored.bucket, key: dailyStored.key },
      },
      update: {
        workspaceId: args.workspaceId,
        ownerUserId: args.userId,
        contentType: "text/markdown",
        sizeBytes: dailyStored.sizeBytes,
        sha256: dailyStored.sha256,
        encryption: dailyStored.encryption,
        deletedAt: null,
      },
      create: {
        workspaceId: args.workspaceId,
        ownerUserId: args.userId,
        bucket: dailyStored.bucket,
        key: dailyStored.key,
        contentType: "text/markdown",
        sizeBytes: dailyStored.sizeBytes,
        sha256: dailyStored.sha256,
        encryption: dailyStored.encryption,
      },
    }),
  ]);

  return { baseKey, dailyKey };
}
