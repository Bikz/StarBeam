import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import { createBetaKey, disableBetaKey } from "@/app/admin/beta-keys/actions";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

export default async function BetaKeysAdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    error?: string;
    disabled?: string;
  }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdminEmail(session.user.email))
    redirect("/login");

  const sp = await searchParams;
  const created = sp.created ? String(sp.created) : "";
  const error = sp.error ? String(sp.error) : "";

  const keys = await prisma.betaKey.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const keyIds = keys.map((k) => k.id);
  const counts = await prisma.betaKeyRedemption.groupBy({
    by: ["betaKeyId"],
    where: { betaKeyId: { in: keyIds } },
    _count: { _all: true },
  });
  const usedByKey = new Map(counts.map((c) => [c.betaKeyId, c._count._all]));

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="sb-card p-8">
          <div className="sb-title text-2xl">Beta keys</div>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            Generate multi-use invite keys for private beta access. Keep the
            plaintext code out of logs and screenshots.
          </p>

          {created ? (
            <div className="mt-6 sb-card-inset p-4">
              <div className="text-xs font-semibold text-[color:var(--sb-muted)]">
                Newly created key (copy it now)
              </div>
              <div className="mt-1 font-mono text-sm text-[color:var(--sb-fg)] break-all">
                {created}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 sb-alert">
              <strong>Error:</strong> {error}
            </div>
          ) : null}

          <div className="mt-8 sb-card-inset p-6">
            <div className="sb-title text-lg">Create key</div>
            <form
              action={createBetaKey}
              className="mt-4 grid gap-3 sm:grid-cols-3"
            >
              <label className="grid gap-2 sm:col-span-2">
                <div className="text-xs font-extrabold sb-title">Label</div>
                <input
                  name="label"
                  placeholder="Launch batch A"
                  className="sb-input"
                />
              </label>
              <label className="grid gap-2">
                <div className="text-xs font-extrabold sb-title">Max uses</div>
                <input
                  name="maxUses"
                  type="number"
                  defaultValue={100}
                  min={1}
                  className="sb-input"
                />
              </label>
              <label className="grid gap-2 sm:col-span-2">
                <div className="text-xs font-extrabold sb-title">
                  Valid days (0 = no expiry)
                </div>
                <input
                  name="validDays"
                  type="number"
                  defaultValue={0}
                  min={0}
                  className="sb-input"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  className={sbButtonClass({
                    variant: "primary",
                    className: "h-11 px-6 text-sm font-extrabold",
                  })}
                >
                  Generate
                </button>
              </div>
            </form>
          </div>

          <div className="mt-8">
            <div className="text-xs font-extrabold sb-title">Recent keys</div>
            {keys.length === 0 ? (
              <div className="mt-2 text-sm text-[color:var(--sb-muted)]">
                No keys yet.
              </div>
            ) : (
              <div className="mt-3 grid gap-2">
                {keys.map((k) => {
                  const used = usedByKey.get(k.id) ?? 0;
                  const exhausted = used >= k.maxUses;
                  const disabled = Boolean(k.disabledAt);
                  const expired = Boolean(
                    k.expiresAt && k.expiresAt <= new Date(),
                  );

                  const status = disabled
                    ? "disabled"
                    : expired
                      ? "expired"
                      : exhausted
                        ? "exhausted"
                        : "active";

                  return (
                    <div key={k.id} className="sb-card-inset px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold text-[color:var(--sb-fg)]">
                          {k.label || "Untitled"}
                        </div>
                        <div className="sb-pill">{status}</div>
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                        Uses: {used}/{k.maxUses}
                        {k.expiresAt
                          ? ` · Expires: ${k.expiresAt.toISOString()}`
                          : ""}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Link
                          href={`/admin/beta-keys/${k.id}`}
                          className={sbButtonClass({
                            variant: "secondary",
                            className: "px-4 py-2 text-xs font-semibold",
                          })}
                        >
                          View redemptions
                        </Link>
                        {!disabled ? (
                          <form action={disableBetaKey.bind(null, k.id)}>
                            <button
                              type="submit"
                              className={sbButtonClass({
                                variant: "secondary",
                                className: "px-4 py-2 text-xs font-semibold",
                              })}
                            >
                              Disable
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
