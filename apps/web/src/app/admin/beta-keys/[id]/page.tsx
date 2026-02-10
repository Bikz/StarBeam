import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import { disableBetaKey } from "@/app/admin/beta-keys/actions";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

function statusForKey(
  key: { disabledAt: Date | null; expiresAt: Date | null },
  used: number,
  maxUses: number,
) {
  const disabled = Boolean(key.disabledAt);
  const expired = Boolean(key.expiresAt && key.expiresAt <= new Date());
  const exhausted = used >= maxUses;

  if (disabled) return "disabled";
  if (expired) return "expired";
  if (exhausted) return "exhausted";
  return "active";
}

export default async function BetaKeyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdminEmail(session.user.email))
    redirect("/login");

  const { id } = await params;

  const key = await prisma.betaKey.findUnique({
    where: { id },
    select: {
      id: true,
      label: true,
      maxUses: true,
      createdAt: true,
      expiresAt: true,
      disabledAt: true,
    },
  });
  if (!key) notFound();

  const [used, redemptions] = await Promise.all([
    prisma.betaKeyRedemption.count({ where: { betaKeyId: key.id } }),
    prisma.betaKeyRedemption.findMany({
      where: { betaKeyId: key.id },
      orderBy: { createdAt: "desc" },
      take: 250,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
            betaAccessGrantedAt: true,
          },
        },
      },
    }),
  ]);

  const status = statusForKey(key, used, key.maxUses);

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="sb-card p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="sb-title text-2xl">Beta key</div>
              <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                Plaintext codes are not stored. You can only copy the code at
                creation time.
              </div>
            </div>
            <Link
              href="/admin/beta-keys"
              className={sbButtonClass({
                variant: "secondary",
                className: "h-11 px-5 text-sm font-semibold",
              })}
            >
              Back to keys
            </Link>
          </div>

          <div className="mt-7 sb-card-inset p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-extrabold sb-title">Label</div>
                <div className="mt-1 text-sm text-[color:var(--sb-fg)] break-words">
                  {key.label || "Untitled"}
                </div>
                <div className="mt-4 text-xs text-[color:var(--sb-muted)]">
                  Uses: {used}/{key.maxUses} · Status:{" "}
                  <span className="font-semibold text-[color:var(--sb-fg)]">
                    {status}
                  </span>
                </div>
                <div className="mt-2 text-xs text-[color:var(--sb-muted)]">
                  Created: {key.createdAt.toISOString()}
                  {key.expiresAt
                    ? ` · Expires: ${key.expiresAt.toISOString()}`
                    : ""}
                </div>
              </div>

              {!key.disabledAt ? (
                <form action={disableBetaKey.bind(null, key.id)}>
                  <button
                    type="submit"
                    className={sbButtonClass({
                      variant: "secondary",
                      className: "h-11 px-5 text-sm font-semibold",
                    })}
                  >
                    Disable key
                  </button>
                </form>
              ) : (
                <div className="sb-pill">disabled</div>
              )}
            </div>
          </div>

          <div className="mt-8">
            <div className="text-xs font-extrabold sb-title">Redemptions</div>
            {used === 0 ? (
              <div className="mt-2 text-sm text-[color:var(--sb-muted)]">
                No one has redeemed this key yet.
              </div>
            ) : (
              <div className="mt-3 grid gap-2">
                {redemptions.map((r) => (
                  <div key={r.id} className="sb-card-inset px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-[color:var(--sb-fg)] truncate">
                          {r.user.email ?? "unknown email"}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                          Redeemed: {r.createdAt.toISOString()} · User:{" "}
                          {r.userId}
                        </div>
                      </div>
                      <div className="sb-pill">
                        {r.user.betaAccessGrantedAt
                          ? "access granted"
                          : "no access"}
                      </div>
                    </div>
                  </div>
                ))}
                {used > redemptions.length ? (
                  <div className="mt-2 text-xs text-[color:var(--sb-muted)]">
                    Showing latest {redemptions.length} redemptions.
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
