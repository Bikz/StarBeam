/* eslint-disable react-hooks/purity */

import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { createInvite } from "@/app/w/[slug]/members/actions";
import { authOptions } from "@/lib/auth";

function origin(): string {
  return process.env.NEXT_PUBLIC_WEB_ORIGIN || "http://localhost:3000";
}

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const [{ slug }, sp] = await Promise.all([params, searchParams]);

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug } },
    include: { workspace: true },
  });
  if (!membership) notFound();

  const isAdmin = membership.role === "ADMIN";

  const [members, invites] = await Promise.all([
    prisma.membership.findMany({
      where: { workspaceId: membership.workspace.id },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invite.findMany({
      where: { workspaceId: membership.workspace.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const inviteToken = sp.invite;
  const inviteUrl = inviteToken ? `${origin()}/invite/${inviteToken}` : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="sb-card p-7">
        <div className="flex items-center justify-between gap-4">
          <div className="sb-title text-xl">Current members</div>
          <div className="text-xs text-[color:var(--sb-muted)]">
            {members.length} total
          </div>
        </div>

        <div className="mt-5 grid gap-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[color:var(--sb-fg)]">
                  {m.user.email}
                </div>
                <div className="text-xs text-[color:var(--sb-muted)]">
                  {m.user.name || "No name"} - {m.role.toLowerCase()}
                </div>
              </div>
              <div className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-2.5 py-1 text-[11px] text-[color:var(--sb-muted)]">
                {m.userId.slice(0, 8)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sb-card p-7">
        <div className="sb-title text-xl">Invite someone</div>
        <p className="mt-2 text-sm text-[color:var(--sb-muted)]">
          v0 is invite-only. Invites are tied to email and expire in 7 days.
        </p>

        {!isAdmin ? (
          <div className="mt-5 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-sm text-[color:var(--sb-muted)]">
            Only admins can create invites in v0.
          </div>
        ) : (
          <form
            action={createInvite.bind(null, membership.workspace.slug)}
            className="mt-5 grid gap-3"
          >
            <label className="grid gap-1 text-sm">
              <span className="text-[color:var(--sb-muted)]">Email</span>
              <input
                name="email"
                type="email"
                placeholder="teammate@company.com"
                className="h-11 rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-4 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
                required
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[color:var(--sb-muted)]">Role</span>
              <select
                name="role"
                className="h-11 rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-3 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
                defaultValue="MEMBER"
              >
                <option value="MEMBER">Member</option>
                <option value="MANAGER">Manager</option>
              </select>
            </label>
            <button
              type="submit"
              className="sb-btn h-11 px-5 text-sm font-extrabold"
            >
              Create invite link
            </button>
          </form>
        )}

        {inviteUrl ? (
          <div className="mt-6 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4">
            <div className="text-xs font-extrabold sb-title">New invite link</div>
            <div className="mt-2 break-all text-xs text-[color:var(--sb-muted)]">
              {inviteUrl}
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          <div className="text-xs font-extrabold sb-title">Recent invites</div>
          {invites.length === 0 ? (
            <div className="mt-2 text-sm text-[color:var(--sb-muted)]">
              No invites yet.
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              {invites.map((inv) => {
                const expired = inv.expiresAt.getTime() < Date.now();
                const status = inv.usedAt
                  ? "used"
                  : expired
                    ? "expired"
                    : "active";
                return (
                  <div
                    key={inv.id}
                    className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 px-4 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-[color:var(--sb-fg)]">
                        {inv.email}
                      </div>
                      <div className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-2.5 py-1 text-[11px] text-[color:var(--sb-muted)]">
                        {inv.role.toLowerCase()} - {status}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                      Expires {inv.expiresAt.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
