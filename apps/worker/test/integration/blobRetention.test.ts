import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { prisma } from "@starbeam/db";

import { markOrphanedContentBlobsDeletedAt } from "../../src/lib/google/blobRetention";

function hasDatabaseUrl(): boolean {
  return (
    typeof process.env.DATABASE_URL === "string" &&
    process.env.DATABASE_URL.length > 0
  );
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

test(
  "markOrphanedContentBlobsDeletedAt marks only truly orphaned blobs",
  { skip: !hasDatabaseUrl() },
  async () => {
    const now = new Date();
    const email = `worker-integration-${Date.now()}@starbeamhq.com`;
    const slug = `worker-integration-${Date.now()}`;

    const user = await prisma.user.create({
      data: {
        email,
        emailVerified: now,
        betaAccessGrantedAt: now,
      },
      select: { id: true },
    });

    const workspace = await prisma.workspace.create({
      data: {
        slug,
        name: "Worker Integration",
        type: "ORG",
        createdById: user.id,
        memberships: { create: { userId: user.id, role: "ADMIN" } },
      },
      select: { id: true },
    });

    const connection = await prisma.googleConnection.create({
      data: {
        workspaceId: workspace.id,
        ownerUserId: user.id,
        googleAccountEmail: email,
        accessTokenEnc: "test-access-token-enc",
        refreshTokenEnc: "test-refresh-token-enc",
        status: "CONNECTED",
        syncState: { create: {} },
      },
      select: { id: true },
    });

    const blob1 = await prisma.blob.create({
      data: {
        workspaceId: workspace.id,
        ownerUserId: user.id,
        bucket: "test",
        key: `blob-${Date.now()}-1`,
        contentType: "text/plain",
        sizeBytes: 1,
        sha256: sha256Hex("blob1"),
      },
      select: { id: true },
    });

    const blob2 = await prisma.blob.create({
      data: {
        workspaceId: workspace.id,
        ownerUserId: user.id,
        bucket: "test",
        key: `blob-${Date.now()}-2`,
        contentType: "text/plain",
        sizeBytes: 1,
        sha256: sha256Hex("blob2"),
      },
      select: { id: true },
    });

    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

    const old1 = await prisma.sourceItem.create({
      data: {
        workspaceId: workspace.id,
        ownerUserId: user.id,
        connectionId: connection.id,
        type: "DRIVE_FILE",
        externalId: `old-${Date.now()}-1`,
        url: "https://example.com/old1",
        title: "old1",
        snippet: null,
        contentText: null,
        contentBlobId: blob1.id,
        occurredAt: old,
      },
      select: { id: true },
    });

    const old2 = await prisma.sourceItem.create({
      data: {
        workspaceId: workspace.id,
        ownerUserId: user.id,
        connectionId: connection.id,
        type: "DRIVE_FILE",
        externalId: `old-${Date.now()}-2`,
        url: "https://example.com/old2",
        title: "old2",
        snippet: null,
        contentText: null,
        contentBlobId: blob2.id,
        occurredAt: old,
      },
      select: { id: true },
    });

    await prisma.sourceItem.create({
      data: {
        workspaceId: workspace.id,
        ownerUserId: user.id,
        connectionId: connection.id,
        type: "DRIVE_FILE",
        externalId: `new-${Date.now()}-1`,
        url: "https://example.com/new",
        title: "new",
        snippet: null,
        contentText: null,
        contentBlobId: blob2.id,
        occurredAt: now,
      },
      select: { id: true },
    });

    try {
      // Simulate retention deletion of old source items.
      await prisma.sourceItem.deleteMany({
        where: { id: { in: [old1.id, old2.id] } },
      });

      await markOrphanedContentBlobsDeletedAt({
        workspaceId: workspace.id,
        userId: user.id,
        candidateBlobIds: [blob1.id, blob2.id],
      });

      const [b1, b2] = await Promise.all([
        prisma.blob.findUnique({
          where: { id: blob1.id },
          select: { deletedAt: true },
        }),
        prisma.blob.findUnique({
          where: { id: blob2.id },
          select: { deletedAt: true },
        }),
      ]);

      assert.ok(b1?.deletedAt instanceof Date);
      assert.equal(b2?.deletedAt, null);
    } finally {
      // Cleanup in reverse dependency order.
      await prisma.workspace.delete({ where: { id: workspace.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  },
);
