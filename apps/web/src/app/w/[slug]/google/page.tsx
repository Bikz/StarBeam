import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import {
  disconnectGoogleConnection,
  startGoogleConnect,
} from "@/app/w/[slug]/google/actions";
import { authOptions } from "@/lib/auth";

export default async function GooglePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ connected?: string; disconnected?: string; error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const [{ slug }, sp] = await Promise.all([params, searchParams]);

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug } },
    include: { workspace: true },
  });
  if (!membership) notFound();

  const connections = await prisma.googleConnection.findMany({
    where: { workspaceId: membership.workspace.id, ownerUserId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="sb-card p-7">
        <div className="sb-title text-xl">Google connection</div>
        <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
          Connect your Google account (read-only) so Starbeam can derive Today’s
          Focus and your agenda. Tokens are stored encrypted and email/calendar
          contents are not logged.
        </p>

        {sp.connected ? (
          <div className="mt-5 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-sm text-[color:var(--sb-muted)]">
            Connected.
          </div>
        ) : null}
        {sp.disconnected ? (
          <div className="mt-5 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-sm text-[color:var(--sb-muted)]">
            Disconnected.
          </div>
        ) : null}
        {sp.error ? (
          <div className="mt-5 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-sm text-[color:var(--sb-muted)]">
            Error: {sp.error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <form action={startGoogleConnect.bind(null, membership.workspace.slug)}>
            <button
              type="submit"
              className="sb-btn h-11 px-5 text-sm font-extrabold"
            >
              Connect Google
            </button>
          </form>
        </div>

        <div className="mt-7">
          <div className="text-xs font-extrabold sb-title">Your connections</div>
          {connections.length === 0 ? (
            <div className="mt-2 text-sm text-[color:var(--sb-muted)]">
              No connections yet.
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              {connections.map((c) => (
                <div
                  key={c.id}
                  className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-[color:var(--sb-fg)]">
                      {c.googleAccountEmail}
                    </div>
                    <div className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-2.5 py-1 text-[11px] text-[color:var(--sb-muted)]">
                      {c.status.toLowerCase()}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                    Scopes: {c.scopes.length ? c.scopes.join(", ") : "unknown"}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <form
                      action={disconnectGoogleConnection.bind(
                        null,
                        membership.workspace.slug,
                        c.id,
                      )}
                    >
                      <button
                        type="submit"
                        className="sb-btn px-4 py-2 text-xs font-semibold"
                      >
                        Disconnect
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="sb-card p-7">
        <div className="sb-title text-xl">Privacy</div>
        <div className="mt-3 grid gap-3 text-sm text-[color:var(--sb-muted)] leading-relaxed">
          <div>
            Read-only scopes only. No sending emails, no calendar writes, no
            Drive.
          </div>
          <div>
            Managers cannot view employee raw Gmail/Calendar data. This
            connection is per-user.
          </div>
        </div>
      </div>
    </div>
  );
}
