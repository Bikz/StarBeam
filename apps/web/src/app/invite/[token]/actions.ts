"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { acceptInviteForUser } from "@/lib/invites";

export async function acceptInvite(token: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email)
    throw new Error("Unauthorized");

  const result = await acceptInviteForUser({
    token,
    userId: session.user.id,
    userEmail: session.user.email,
  });

  if (result.ok) {
    redirect(`/w/${result.workspaceSlug}`);
  }

  // Fail closed: redirect back to the invite page. The page will reflect
  // used/expired state deterministically after concurrent attempts.
  redirect(`/invite/${token}`);
}
