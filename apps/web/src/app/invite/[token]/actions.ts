"use server";

import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { acceptInviteForUser } from "@/lib/invites";
import { sha256Hex } from "@/lib/apiTokens";
import { clientIpFromHeaders } from "@/lib/clientIp";
import { consumeRateLimit, RateLimitError } from "@/lib/rateLimit";

export async function acceptInvite(token: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email)
    throw new Error("Unauthorized");

  const headerStore = await headers();
  const ip = clientIpFromHeaders(headerStore) || "unknown";
  const ipHash = sha256Hex(ip);

  try {
    await Promise.all([
      consumeRateLimit({
        key: `invite_accept:user:${session.user.id}`,
        windowSec: 5 * 60,
        limit: Number(process.env.STARB_INVITE_ACCEPT_USER_LIMIT_5M ?? "10"),
      }),
      consumeRateLimit({
        key: `invite_accept:ip:${ipHash}`,
        windowSec: 5 * 60,
        limit: Number(process.env.STARB_INVITE_ACCEPT_IP_LIMIT_5M ?? "30"),
      }),
    ]);
  } catch (err) {
    if (err instanceof RateLimitError) {
      redirect(`/invite/${token}?error=rate_limited`);
    }
    throw err;
  }

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
