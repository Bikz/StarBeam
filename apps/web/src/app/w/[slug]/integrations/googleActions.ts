"use server";

import crypto from "node:crypto";

import { prisma } from "@starbeam/db";
import { redirect } from "next/navigation";

import { requireMembership } from "@/app/w/[slug]/integrations/_shared";
import { enqueueDeleteBlobs } from "@/lib/blobDeleteQueue";
import { mintSignedState } from "@/lib/signedState";
import { webOrigin } from "@/lib/webOrigin";

function requireGoogleEnv(): { clientId: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("Missing GOOGLE_CLIENT_ID");
  return { clientId };
}

export async function startGoogleConnect(workspaceSlug: string) {
  const { userId, workspace } = await requireMembership(workspaceSlug);

  const { clientId } = requireGoogleEnv();
  const origin = webOrigin();
  const redirectUri = `${origin}/api/google/callback`;

  const scopes = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
  ];

  const state = mintSignedState({
    userId,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    nonce: crypto.randomBytes(16).toString("hex"),
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: scopes.join(" "),
    state,
  });

  redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

export async function disconnectGoogleConnection(
  workspaceSlug: string,
  connectionId: string,
) {
  const { userId, workspace } = await requireMembership(workspaceSlug);

  const existing = await prisma.googleConnection.findFirst({
    where: {
      id: connectionId,
      workspaceId: workspace.id,
      ownerUserId: userId,
    },
    select: { id: true },
  });
  if (!existing) throw new Error("Connection not found");

  // Purge Google-derived data before deleting the connection, otherwise
  // SourceItem.connectionId would be nulled (onDelete: SetNull).
  const sourceItems = await prisma.sourceItem.findMany({
    where: {
      workspaceId: workspace.id,
      ownerUserId: userId,
      connectionId: existing.id,
    },
    select: { id: true, contentBlobId: true },
  });

  const candidateBlobIds = sourceItems
    .map((s) => s.contentBlobId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (sourceItems.length) {
    await prisma.sourceItem.deleteMany({
      where: { id: { in: sourceItems.map((s) => s.id) } },
    });
  }

  // Only delete blob-store objects that are no longer referenced by any source item.
  if (candidateBlobIds.length) {
    const [stillReferenced, blobs] = await Promise.all([
      prisma.sourceItem.findMany({
        where: { contentBlobId: { in: candidateBlobIds } },
        select: { contentBlobId: true },
      }),
      prisma.blob.findMany({
        where: { id: { in: candidateBlobIds }, deletedAt: null },
        select: { id: true, bucket: true, key: true },
      }),
    ]);

    const referenced = new Set(
      stillReferenced
        .map((s) => s.contentBlobId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );
    const orphaned = blobs.filter((b) => !referenced.has(b.id));
    const orphanedIds = orphaned.map((b) => b.id);

    if (orphanedIds.length) {
      await prisma.blob.updateMany({
        where: { id: { in: orphanedIds } },
        data: { deletedAt: new Date() },
      });

      await enqueueDeleteBlobs({
        blobs: orphaned.map((b) => ({ bucket: b.bucket, key: b.key })),
      }).catch(() => undefined);
    }
  }

  await prisma.googleConnection.delete({ where: { id: existing.id } });
  redirect(`/w/${workspaceSlug}/integrations?disconnected=google`);
}

