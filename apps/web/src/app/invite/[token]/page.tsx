import crypto from "node:crypto";

import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { prisma } from "@starbeam/db";

import SignInButton from "@/components/sign-in-button";
import { acceptInvite } from "@/app/invite/[token]/actions";
import { authOptions } from "@/lib/auth";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export default async function InvitePage({
  params,
}: {
  params: { token: string };
}) {
  const session = await getServerSession(authOptions);
  const { token } = params;

  const invite = await prisma.invite.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: { workspace: true },
  });

  if (!invite) notFound();

  const expired = invite.expiresAt.getTime() < Date.now();
  const used = Boolean(invite.usedAt);

  const sessionEmail = session?.user?.email?.toLowerCase();
  const emailMismatch =
    sessionEmail && invite.email.toLowerCase() !== sessionEmail;

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="sb-card p-8">
          <div className="sb-title text-2xl">You are invited</div>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)]">
            Workspace:{" "}
            <span className="font-semibold text-[color:var(--sb-fg)]">
              {invite.workspace.name}
            </span>{" "}
            | Role:{" "}
            <span className="font-semibold text-[color:var(--sb-fg)]">
              {invite.role.toLowerCase()}
            </span>
          </p>

          {used ? (
            <div className="mt-6 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-sm text-[color:var(--sb-muted)]">
              This invite link was already used.
            </div>
          ) : expired ? (
            <div className="mt-6 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-sm text-[color:var(--sb-muted)]">
              This invite link expired.
            </div>
          ) : !session?.user?.id ? (
            <div className="mt-6">
              <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-sm text-[color:var(--sb-muted)]">
                Sign in to accept this invite.
              </div>
              <div className="mt-4">
                <SignInButton />
              </div>
            </div>
          ) : emailMismatch ? (
            <div className="mt-6 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-sm text-[color:var(--sb-muted)]">
              This invite is for{" "}
              <span className="font-semibold text-[color:var(--sb-fg)]">
                {invite.email}
              </span>
              . You are signed in as{" "}
              <span className="font-semibold text-[color:var(--sb-fg)]">
                {session.user.email}
              </span>
              .
            </div>
          ) : (
            <form action={acceptInvite.bind(null, token)} className="mt-6">
              <button
                type="submit"
                className="sb-btn h-11 px-5 text-sm font-extrabold"
              >
                Accept invite
              </button>
            </form>
          )}

          <div className="mt-8">
            <Link href="/" className="text-sm text-[color:var(--sb-muted)]">
              &lt;- Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
