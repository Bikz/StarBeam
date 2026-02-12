import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import {
  grantBetaAccess,
  revokeBetaAccess,
} from "@/app/admin/waitlist/actions";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { webOrigin } from "@/lib/webOrigin";

function csvEscape(value: string): string {
  if (!value.includes('"') && !value.includes(",") && !value.includes("\n")) {
    return value;
  }
  return `"${value.replaceAll('"', '""')}"`;
}

export default async function WaitlistAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ granted?: string; revoked?: string; error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdminEmail(session.user.email))
    redirect("/login");

  const sp = await searchParams;
  const granted = sp.granted === "1";
  const revoked = sp.revoked === "1";
  const error = sp.error ? String(sp.error) : "";

  const users = await prisma.user.findMany({
    where: {
      email: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 250,
    select: {
      id: true,
      email: true,
      createdAt: true,
      betaAccessGrantedAt: true,
      referralCode: true,
    },
  });

  const waitlist = users.filter((u) => !u.betaAccessGrantedAt);
  const waitlistIds = waitlist.map((u) => u.id);

  const referralCounts =
    waitlistIds.length === 0
      ? []
      : await prisma.user.groupBy({
          by: ["referredByUserId"],
          where: { referredByUserId: { in: waitlistIds } },
          _count: { _all: true },
        });

  const referralCountByUserId = new Map<string, number>();
  for (const r of referralCounts) {
    if (r.referredByUserId)
      referralCountByUserId.set(r.referredByUserId, r._count._all);
  }

  const referralBase = webOrigin();
  const csvHeader = [
    "email",
    "createdAt",
    "referralCount",
    "referralUrl",
    "referralCode",
  ].join(",");
  const csvRows = waitlist.map((u) => {
    const email = u.email ?? "";
    const createdAt = u.createdAt.toISOString();
    const referralCount = String(referralCountByUserId.get(u.id) ?? 0);
    const referralCode = u.referralCode ?? "";
    const referralUrl = referralCode
      ? `${referralBase}/r/${encodeURIComponent(referralCode)}`
      : "";

    return [
      csvEscape(email),
      csvEscape(createdAt),
      csvEscape(referralCount),
      csvEscape(referralUrl),
      csvEscape(referralCode),
    ].join(",");
  });
  const csvText = [csvHeader, ...csvRows].join("\n");

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="sb-card p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="sb-title text-2xl">Waitlist</div>
              <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed max-w-2xl">
                Latest sign-ins. This view is intentionally simple: identify
                founders/leads, reach out, and grant access for design partners
                without waiting on referrals/invite keys.
              </p>
              <div className="mt-3 text-xs text-[color:var(--sb-muted)]">
                Showing {waitlist.length} without access (from {users.length}{" "}
                newest users).
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/admin/ops/funnel"
                className={sbButtonClass({
                  variant: "secondary",
                  className: "h-10 px-4 text-xs font-semibold",
                })}
              >
                Ops funnel
              </Link>
              <Link
                href="/admin/beta-keys"
                className={sbButtonClass({
                  variant: "secondary",
                  className: "h-10 px-4 text-xs font-semibold",
                })}
              >
                Beta keys
              </Link>
              <Link
                href="/admin/feedback"
                className={sbButtonClass({
                  variant: "secondary",
                  className: "h-10 px-4 text-xs font-semibold",
                })}
              >
                Feedback inbox
              </Link>
            </div>
          </div>

          {granted ? (
            <div className="mt-6 sb-alert">Granted beta access.</div>
          ) : null}
          {revoked ? (
            <div className="mt-6 sb-alert">Revoked beta access.</div>
          ) : null}
          {error ? (
            <div className="mt-6 sb-alert">
              <strong>Error:</strong> {error}
            </div>
          ) : null}

          <div className="mt-8 grid gap-2">
            <div className="text-xs font-extrabold sb-title">Export (CSV)</div>
            <div className="text-xs text-[color:var(--sb-muted)]">
              Copy/paste into your lead list tool. This includes email addresses
              and referral links.
            </div>
            <textarea
              readOnly
              value={csvText}
              rows={6}
              className="sb-textarea font-mono text-[12px]"
              aria-label="Waitlist CSV export"
            />
          </div>

          <div className="mt-10">
            <div className="text-xs font-extrabold sb-title">People</div>
            {waitlist.length === 0 ? (
              <div className="mt-2 text-sm text-[color:var(--sb-muted)]">
                No waitlist users found.
              </div>
            ) : (
              <div className="mt-3 grid gap-2">
                {waitlist.slice(0, 120).map((u) => {
                  const email = u.email ?? "unknown";
                  const count = referralCountByUserId.get(u.id) ?? 0;
                  const ref = u.referralCode ?? "";
                  const referralUrl = ref
                    ? `${referralBase}/r/${encodeURIComponent(ref)}`
                    : "";

                  return (
                    <div key={u.id} className="sb-card-inset px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-[color:var(--sb-fg)] truncate">
                            {email}
                          </div>
                          <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                            Created: {u.createdAt.toISOString()}{" "}
                            <span aria-hidden>·</span> Referrals: {count}/5
                          </div>
                          {referralUrl ? (
                            <div className="mt-1 text-[11px] text-[color:var(--sb-muted)] break-all">
                              Referral: {referralUrl}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <form action={grantBetaAccess}>
                            <input type="hidden" name="userId" value={u.id} />
                            <button
                              type="submit"
                              className={sbButtonClass({
                                variant: "primary",
                                className: "h-9 px-4 text-xs font-extrabold",
                              })}
                            >
                              Grant access
                            </button>
                          </form>
                          <form action={revokeBetaAccess}>
                            <input type="hidden" name="userId" value={u.id} />
                            <button
                              type="submit"
                              className={sbButtonClass({
                                variant: "secondary",
                                className: "h-9 px-4 text-xs font-semibold",
                              })}
                            >
                              Revoke
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {waitlist.length > 120 ? (
              <div className="mt-3 text-xs text-[color:var(--sb-muted)]">
                Showing first 120. Increase limit if needed.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
