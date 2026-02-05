"use server";

import crypto from "node:crypto";

import { prisma } from "@starbeam/db";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { mintSignedState } from "@/lib/signedState";
import { webOrigin } from "@/lib/webOrigin";

function requireGoogleEnv(): { clientId: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("Missing GOOGLE_CLIENT_ID");
  return { clientId };
}

export async function startGoogleConnect(workspaceSlug: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: true },
  });
  if (!membership) throw new Error("Not a member");

  const { clientId } = requireGoogleEnv();
  const origin = webOrigin();
  const redirectUri = `${origin}/api/google/callback`;

  const scopes = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
  ];

  const state = mintSignedState({
    userId: session.user.id,
    workspaceId: membership.workspace.id,
    workspaceSlug: membership.workspace.slug,
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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: true },
  });
  if (!membership) throw new Error("Not a member");

  const existing = await prisma.googleConnection.findFirst({
    where: {
      id: connectionId,
      workspaceId: membership.workspace.id,
      ownerUserId: session.user.id,
    },
    select: { id: true },
  });
  if (!existing) throw new Error("Connection not found");

  await prisma.googleConnection.delete({ where: { id: existing.id } });
  redirect(`/w/${workspaceSlug}/google?disconnected=1`);
}

