import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import { createDepartment, updateDepartment } from "@/app/w/[slug]/departments/actions";

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export default async function DepartmentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const { slug } = await params;

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug } },
    include: { workspace: true },
  });
  if (!membership) notFound();

  const manageable = canManage(membership.role);

  const [departments, members] = await Promise.all([
    prisma.department.findMany({
      where: { workspaceId: membership.workspace.id },
      include: { memberships: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.membership.findMany({
      where: { workspaceId: membership.workspace.id },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="sb-card p-7">
        <div className="flex items-center justify-between gap-4">
          <div className="sb-title text-xl">Tracks</div>
          <div className="text-xs text-[color:var(--sb-muted)]">
            {departments.length} configured
          </div>
        </div>
        <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
          Tracks are department-specific prompts. Nightly web research runs per
          track. For the demo, start with a Marketing track prompt focused on
          topics + competitors.
        </p>

        {departments.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-sm text-[color:var(--sb-muted)]">
            No departments yet. Create Marketing to unlock the demo narrative.
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {departments.map((d) => (
              <div
                key={d.id}
                className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="sb-title text-lg">{d.name}</div>
                    <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                      {d.enabled ? "Enabled" : "Disabled"} - {d.memberships.length}{" "}
                      members
                    </div>
                  </div>
                </div>

                <form
                  action={updateDepartment.bind(null, membership.workspace.slug, d.id)}
                  className="mt-4 grid gap-3"
                >
                  <label className="grid gap-1 text-sm">
                    <span className="text-[color:var(--sb-muted)]">Prompt</span>
                    <textarea
                      name="promptTemplate"
                      className="min-h-[120px] rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-4 py-3 text-[13px] leading-relaxed outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
                      defaultValue={d.promptTemplate}
                      readOnly={!manageable}
                    />
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={d.enabled}
                      disabled={!manageable}
                    />
                    <span className="text-[color:var(--sb-muted)]">Enabled</span>
                  </label>

                  <button
                    type="submit"
                    className="sb-btn h-10 px-4 text-xs font-extrabold"
                    disabled={!manageable}
                    title={!manageable ? "Managers/Admins only" : undefined}
                  >
                    Save
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sb-card p-7">
        <div className="sb-title text-xl">Create a track</div>
        <p className="mt-2 text-sm text-[color:var(--sb-muted)]">
          v0 is minimal: template + fields. Member assignment defaults to
          &quot;all members&quot; when created.
        </p>

        {!manageable ? (
          <div className="mt-5 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-sm text-[color:var(--sb-muted)]">
            Only managers/admins can create departments.
          </div>
        ) : (
          <form action={createDepartment.bind(null, membership.workspace.slug)} className="mt-5 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-[color:var(--sb-muted)]">Name</span>
              <input
                name="name"
                placeholder="Marketing"
                className="h-11 rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-4 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
                required
                minLength={2}
                maxLength={48}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[color:var(--sb-muted)]">Prompt template</span>
              <textarea
                name="promptTemplate"
                placeholder="Track topics + competitors. Produce 1-2 cited web insight cards..."
                className="min-h-[140px] rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-4 py-3 text-[13px] leading-relaxed outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
              />
            </label>
            <button type="submit" className="sb-btn h-11 px-5 text-sm font-extrabold">
              Create department
            </button>
          </form>
        )}

        <div className="mt-6 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-xs text-[color:var(--sb-muted)] leading-relaxed">
          Workspace members:{" "}
          <span className="font-semibold text-[color:var(--sb-fg)]">
            {members.length}
          </span>
          . Department membership editing lands after the first demo run.
        </div>
      </div>
    </div>
  );
}
