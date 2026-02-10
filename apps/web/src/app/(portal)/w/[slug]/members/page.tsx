/* eslint-disable react-hooks/purity */

import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import { createInvite } from "@/app/(portal)/w/[slug]/members/actions";
import PageHeader from "@/components/page-header";
import { authOptions } from "@/lib/auth";
import { webOrigin } from "@/lib/webOrigin";

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
  const inviteUrl = inviteToken ? `${webOrigin()}/invite/${inviteToken}` : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="sb-card p-7">
        <PageHeader
          title="Current members"
          actions={
            <div className="text-xs text-[color:var(--sb-muted)]">
              {members.length} total
            </div>
          }
        />

        <div className="mt-5 grid gap-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="sb-card-inset flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[color:var(--sb-fg)]">
                  {m.user.email}
                </div>
                <div className="text-xs text-[color:var(--sb-muted)]">
                  {m.user.name || "No name"} - {m.role.toLowerCase()}
                </div>
              </div>
              <div className="sb-pill">{m.userId.slice(0, 8)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="sb-card p-7">
        <PageHeader
          title="Invite someone"
          description="Create a link-based invite. Invites are tied to email and expire in 7 days."
        />

        {!isAdmin ? (
          <div className="mt-5 sb-alert">
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
                placeholder="teammate@company.com…"
                autoComplete="email"
                spellCheck={false}
                className="sb-input"
                required
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[color:var(--sb-muted)]">Role</span>
              <select name="role" className="sb-select" defaultValue="MEMBER">
                <option value="MEMBER">Member</option>
                <option value="MANAGER">Manager</option>
              </select>
            </label>
            <button
              type="submit"
              className={sbButtonClass({
                variant: "primary",
                className: "h-11 px-5 text-sm font-extrabold",
              })}
            >
              Create invite link
            </button>
          </form>
        )}

        {inviteUrl ? (
          <div className="mt-6 sb-card-inset p-4">
            <div className="text-xs font-extrabold sb-title">
              New invite link
            </div>
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
                  <div key={inv.id} className="sb-card-inset px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-[color:var(--sb-fg)]">
                        {inv.email}
                      </div>
                      <div className="sb-pill">
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
