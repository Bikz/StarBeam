import { prisma } from "@starbeam/db";

export async function markOrphanedContentBlobsDeletedAt(args: {
  workspaceId: string;
  userId: string;
  candidateBlobIds: string[];
}): Promise<{ orphanedCount: number }> {
  const ids = Array.from(
    new Set(
      args.candidateBlobIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    ),
  );

  if (ids.length === 0) return { orphanedCount: 0 };

  const stillReferenced = await prisma.sourceItem.findMany({
    where: { contentBlobId: { in: ids } },
    select: { contentBlobId: true },
    distinct: ["contentBlobId"],
  });

  const referenced = new Set(
    stillReferenced
      .map((s) => s.contentBlobId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  const orphaned = ids.filter((id) => !referenced.has(id));
  if (orphaned.length === 0) return { orphanedCount: 0 };

  const updated = await prisma.blob.updateMany({
    where: {
      id: { in: orphaned },
      workspaceId: args.workspaceId,
      ownerUserId: args.userId,
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  });

  return { orphanedCount: updated.count };
}
