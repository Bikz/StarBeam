/* eslint-disable react-hooks/purity */

import crypto from "node:crypto";

import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import { acceptInvite } from "@/app/invite/[token]/actions";
import { authOptions } from "@/lib/auth";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const session = await getServerSession(authOptions);
  const { token } = await params;

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
            <div className="mt-6 sb-alert">
              This invite link was already used.
            </div>
          ) : expired ? (
            <div className="mt-6 sb-alert">This invite link expired.</div>
          ) : !session?.user?.id ? (
            <div className="mt-6">
              <div className="sb-alert">Sign in to accept this invite.</div>
              <div className="mt-4">
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`}
                  className={sbButtonClass({
                    variant: "primary",
                    className: "h-11 px-6 text-sm font-extrabold",
                  })}
                >
                  Sign in
                </Link>
              </div>
            </div>
          ) : emailMismatch ? (
            <div className="mt-6 sb-alert">
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
                className={sbButtonClass({
                  variant: "primary",
                  className: "h-11 px-5 text-sm font-extrabold",
                })}
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
