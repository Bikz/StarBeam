import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { createDepartment, updateDepartment } from "@/app/(portal)/w/[slug]/departments/actions";
import { createGoal, deleteGoal, toggleGoalActive } from "@/app/(portal)/w/[slug]/goals/actions";
import { authOptions } from "@/lib/auth";

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

function priorityBadge(priority: string): string {
  if (priority === "HIGH") return "High";
  if (priority === "LOW") return "Low";
  return "Med";
}

export default async function TracksPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ track?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const [{ slug }, sp] = await Promise.all([params, searchParams]);

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug } },
    include: { workspace: true },
  });
  if (!membership) notFound();

  const manageable = canManage(membership.role);

  const [departments, goals] = await Promise.all([
    prisma.department.findMany({
      where: { workspaceId: membership.workspace.id },
      include: { memberships: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.goal.findMany({
      where: { workspaceId: membership.workspace.id },
      include: { department: true, author: true },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
  ]);

  const selectedIdRaw = (sp.track ?? "").trim();
  const selectedId =
    selectedIdRaw && departments.some((d) => d.id === selectedIdRaw)
      ? selectedIdRaw
      : departments[0]?.id ?? null;

  const selected = selectedId ? departments.find((d) => d.id === selectedId) ?? null : null;

  const goalsForSelected = selected
    ? goals.filter((g) => g.departmentId === selected.id)
    : [];
  const activeCount = goalsForSelected.filter((g) => g.active).length;

  const base = `/w/${membership.workspace.slug}`;

  if (departments.length === 0) {
    return (
      <div className="sb-card p-7">
        <h1 className="sb-title text-xl font-extrabold">Tracks and goals</h1>
        <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
          Tracks (departments) are the container for goals. Every goal belongs to a track.
        </p>

        {!manageable ? (
          <div className="mt-5 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-sm text-[color:var(--sb-muted)]">
            Only managers/admins can create tracks.
          </div>
        ) : (
          <form action={createDepartment.bind(null, membership.workspace.slug)} className="mt-6 grid gap-3 max-w-md">
            <label className="grid gap-1 text-sm">
              <span className="text-[color:var(--sb-muted)]">Name</span>
              <input
                name="name"
                defaultValue="General"
                className="h-11 rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-4 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
                required
                minLength={2}
                maxLength={48}
              />
            </label>
            <button type="submit" className="sb-btn h-11 px-5 text-sm font-extrabold">
              Create track
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <>
      <h1 className="sr-only">Tracks</h1>
      <div className="grid gap-6 lg:grid-cols-[0.42fr_0.58fr]">
        <div className="sb-card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="sb-title text-lg font-extrabold">Tracks</h2>
              <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                {departments.length} total
              </div>
            </div>
          </div>

        <div className="mt-4 grid gap-2">
          {departments.map((d) => {
            const isSelected = d.id === selected?.id;
            const goalCount = goals.filter((g) => g.departmentId === d.id && g.active).length;
            return (
              <Link
                key={d.id}
                href={`${base}/tracks?track=${encodeURIComponent(d.id)}`}
                className={[
                  "rounded-2xl border px-4 py-3 text-sm",
                  isSelected
                    ? "border-black/10 dark:border-white/20 bg-black/5 dark:bg-white/10"
                    : "border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-[color:var(--sb-fg)] truncate">
                      {d.name}
                    </div>
                    <div className="mt-0.5 text-xs text-[color:var(--sb-muted)]">
                      {d.enabled ? "Enabled" : "Disabled"}
                    </div>
                  </div>
                  <div className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-2.5 py-1 text-[11px] text-[color:var(--sb-muted)]">
                    {goalCount}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {manageable ? (
          <div className="mt-5">
            <div className="text-xs font-extrabold sb-title">Add a track</div>
            <form action={createDepartment.bind(null, membership.workspace.slug)} className="mt-2 grid gap-2">
              <input
                name="name"
                placeholder="Marketing"
                className="h-10 rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-4 text-[14px] outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
                required
                minLength={2}
                maxLength={48}
              />
              <button type="submit" className="sb-btn h-10 px-4 text-xs font-extrabold">
                Create
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-5 text-xs text-[color:var(--sb-muted)]">
            Only managers/admins can create tracks.
          </div>
        )}
      </div>

        <div className="sb-card p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="sb-title text-xl font-extrabold">{selected?.name ?? "Track"}</h2>
              <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                {activeCount} active (max 5)
              </div>
            </div>
            <div />
          </div>

        {selected ? (
          <form
            action={updateDepartment.bind(null, membership.workspace.slug, selected.id)}
            className="mt-5 grid gap-3"
          >
            <details className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-[color:var(--sb-fg)]">
                Track prompt (advanced)
              </summary>
              <div className="mt-3 grid gap-3">
                <label className="grid gap-1 text-sm">
                  <span className="text-[color:var(--sb-muted)]">Prompt template</span>
                  <textarea
                    name="promptTemplate"
                    className="min-h-[140px] rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-4 py-3 text-[13px] leading-relaxed outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
                    defaultValue={selected.promptTemplate}
                    readOnly={!manageable}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={selected.enabled}
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
              </div>
            </details>
          </form>
        ) : null}

        <div className="mt-6">
          <div className="text-xs font-extrabold sb-title">Goals</div>
          {goalsForSelected.length === 0 ? (
            <div className="mt-2 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-sm text-[color:var(--sb-muted)]">
              No goals yet for this track. Add 1–3 concrete goals to steer nightly research.
            </div>
          ) : (
            <div className="mt-3 grid gap-3">
              {goalsForSelected.map((g) => (
                <div
                  key={g.id}
                  className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="sb-title text-lg leading-tight">{g.title}</div>
                      <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                        {g.active ? "Active" : "Inactive"} - {priorityBadge(g.priority)} - by{" "}
                        {g.author.email}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <form action={toggleGoalActive.bind(null, membership.workspace.slug, g.id)}>
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

        <div className="mt-7">
          <div className="sb-title text-lg">Add a goal</div>
          <p className="mt-1 text-sm text-[color:var(--sb-muted)]">
            Goals are the primary driver for nightly ranking and web research.
          </p>

          {!manageable ? (
            <div className="mt-4 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-sm text-[color:var(--sb-muted)]">
              Only managers/admins can create goals.
            </div>
          ) : selected ? (
            <form action={createGoal.bind(null, membership.workspace.slug)} className="mt-4 grid gap-3">
              <input type="hidden" name="departmentId" value={selected.id} />
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
                  <span className="text-[color:var(--sb-muted)]">Target date (optional)</span>
                  <input
                    name="targetDate"
                    type="date"
                    className="h-11 rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-4 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
                  />
                </label>
              </div>
              <button type="submit" className="sb-btn h-11 px-5 text-sm font-extrabold">
                Create goal
              </button>
            </form>
          ) : null}
        </div>
        </div>
      </div>
    </>
  );
}
