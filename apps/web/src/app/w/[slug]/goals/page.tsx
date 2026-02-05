import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import { createGoal, deleteGoal, toggleGoalActive } from "@/app/w/[slug]/goals/actions";

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

function priorityBadge(priority: string): string {
  if (priority === "HIGH") return "High";
  if (priority === "LOW") return "Low";
  return "Med";
}

export default async function GoalsPage({
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

  const [goals, departments] = await Promise.all([
    prisma.goal.findMany({
      where: { workspaceId: membership.workspace.id },
      include: { department: true, author: true },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.department.findMany({
      where: { workspaceId: membership.workspace.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="sb-card p-7">
        <div className="flex items-center justify-between gap-4">
          <div className="sb-title text-xl">Goals</div>
          <div className="text-xs text-[color:var(--sb-muted)]">
            {goals.filter((g) => g.active).length} active (max 5)
          </div>
        </div>

        {goals.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-sm text-[color:var(--sb-muted)]">
            No goals yet. Add 1-3 to drive nightly research and ranking.
          </div>
        ) : (
          <div className="mt-6 grid gap-3">
            {goals.map((g) => (
              <div
                key={g.id}
                className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="sb-title text-lg leading-tight">
                      {g.title}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                      {g.active ? "Active" : "Inactive"} - {priorityBadge(g.priority)}{" "}
                      {g.department ? `- ${g.department.name}` : ""} - by{" "}
                      {g.author.email}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <form
                      action={toggleGoalActive.bind(null, membership.workspace.slug, g.id)}
                    >
                      <button
                        type="submit"
                        className="sb-btn px-4 py-2 text-xs font-semibold"
                        disabled={!manageable}
                        title={!manageable ? "Managers/Admins only" : undefined}
                      >
                        {g.active ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                    <form action={deleteGoal.bind(null, membership.workspace.slug, g.id)}>
                      <button
                        type="submit"
                        className="sb-btn px-4 py-2 text-xs font-semibold"
                        disabled={!manageable}
                        title={!manageable ? "Managers/Admins only" : undefined}
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>

                {g.body ? (
                  <div className="mt-3 text-sm text-[color:var(--sb-muted)] leading-relaxed whitespace-pre-wrap">
                    {g.body}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sb-card p-7">
        <div className="sb-title text-xl">Create a goal</div>
        <p className="mt-2 text-sm text-[color:var(--sb-muted)]">
          Keep it concrete. In v0, goals are a primary driver for web research.
        </p>

        {!manageable ? (
          <div className="mt-5 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-sm text-[color:var(--sb-muted)]">
            Only managers/admins can create goals.
          </div>
        ) : (
          <form action={createGoal.bind(null, membership.workspace.slug)} className="mt-5 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-[color:var(--sb-muted)]">Title</span>
              <input
                name="title"
                placeholder="Increase Q2 awareness for Feature X"
                className="h-11 rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-4 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
                required
                minLength={3}
                maxLength={90}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[color:var(--sb-muted)]">Body (optional)</span>
              <textarea
                name="body"
                placeholder="What does success look like? What should we watch for?"
                className="min-h-[120px] rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-4 py-3 text-[13px] leading-relaxed outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-[color:var(--sb-muted)]">Priority</span>
                <select
                  name="priority"
                  className="h-11 rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-3 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
                  defaultValue="MEDIUM"
                >
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-[color:var(--sb-muted)]">Department</span>
                <select
                  name="departmentId"
                  className="h-11 rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-3 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
                  defaultValue=""
                >
                  <option value="">Company-wide</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="grid gap-1 text-sm">
              <span className="text-[color:var(--sb-muted)]">Target date (optional)</span>
              <input
                name="targetDate"
                type="date"
                className="h-11 rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-4 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
              />
            </label>
            <button type="submit" className="sb-btn h-11 px-5 text-sm font-extrabold">
              Create goal
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
