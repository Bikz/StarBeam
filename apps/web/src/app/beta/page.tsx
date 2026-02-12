import Link from "next/link";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import { redeemBetaKey } from "@/app/beta/actions";
import { authOptions } from "@/lib/auth";
import { staleSessionSignOutUrl } from "@/lib/authRecovery";
import { ensureBetaEligibilityProcessed } from "@/lib/betaAccess";
import { webOrigin } from "@/lib/webOrigin";

export default async function BetaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  // If a referral cookie exists, claim it in a dedicated route handler (so we can clear the cookie).
  const cookieStore = await cookies();
  const ref = cookieStore.get("sb_ref")?.value ?? "";
  if (ref) redirect("/beta/claim?next=/beta");

  const status = await ensureBetaEligibilityProcessed(session.user.id);
  if (!status) redirect(staleSessionSignOutUrl());
  if (status.hasAccess) redirect(`/w/personal-${session.user.id}`);

  const sp = await searchParams;
  const error = sp.error ? String(sp.error) : "";

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  });

  const referralUrl = `${webOrigin()}/r/${encodeURIComponent(status.referralCode)}`;

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="sb-card p-8">
          <div className="sb-title text-2xl">Private beta</div>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            Starbeam is in private beta. Enter an invite key to unlock access,
            or invite 5 friends with your referral link.
          </p>

          <div className="mt-6 sb-alert">
            Signed in as{" "}
            <span className="font-semibold text-[color:var(--sb-fg)]">
              {user?.email ?? session.user.email ?? "unknown"}
            </span>
            .
          </div>

          {error ? (
            <div className="mt-4 sb-alert">
              Could not redeem invite key ({error}).
            </div>
          ) : null}

          <div className="mt-8 grid gap-6">
            <div className="sb-card-inset p-6">
              <div className="sb-title text-lg">Enter invite key</div>
              <form action={redeemBetaKey} className="mt-4 grid gap-3">
                <input
                  name="code"
                  placeholder="Paste invite key"
                  className="sb-input"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="submit"
                  className={sbButtonClass({
                    variant: "primary",
                    className: "h-11 px-5 text-sm font-extrabold",
                  })}
                >
                  Unlock access
                </button>
              </form>
            </div>

            <div className="sb-card-inset p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="sb-title text-lg">Referral unlock</div>
                  <p className="mt-1 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                    Share your link. When 5 people sign up, your account unlocks
                    automatically.
                  </p>
                </div>
                <div className="sb-pill">{status.referralCount}/5</div>
              </div>

              <div className="mt-4 sb-card-inset p-4 text-sm">
                <div className="text-xs font-semibold text-[color:var(--sb-muted)]">
                  Your referral link
                </div>
                <div className="mt-1 font-mono text-[13px] break-all text-[color:var(--sb-fg)]">
                  {referralUrl}
                </div>
              </div>
              <div className="mt-3 text-[11px] text-[color:var(--sb-muted)] leading-relaxed">
                Tip: open it once yourself to confirm it loads, then share.
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3 text-sm">
            <Link
              href="/feedback"
              className="text-[color:var(--sb-fg)] hover:underline"
            >
              Send feedback
            </Link>
            <span className="text-[color:var(--sb-muted)]" aria-hidden>
              ·
            </span>
            <Link
              href="/api/auth/signout?callbackUrl=/login"
              className="text-[color:var(--sb-muted)] hover:underline"
            >
              Sign out
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
