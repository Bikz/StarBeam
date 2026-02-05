import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { runNightlyNow } from "@/app/w/[slug]/jobs/actions";
import { authOptions } from "@/lib/auth";

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

function formatStatus(status: string): string {
  return status.toLowerCase().replaceAll("_", " ");
}

export default async function JobsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ queued?: string }>;
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

  const jobRuns = await prisma.jobRun.findMany({
    where: { workspaceId: membership.workspace.id, kind: "NIGHTLY_WORKSPACE_RUN" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const queued = Boolean(sp.queued);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="sb-card p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="sb-title text-xl">Nightly runs</div>
            <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
              This is the “overnight research” engine. v0 will run it on demand,
              then nightly (2–5am user-local) once scheduling lands.
            </p>
          </div>
          {queued ? (
            <div className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-3 py-1 text-[11px] font-semibold text-[color:var(--sb-muted)]">
              Queued
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <form action={runNightlyNow.bind(null, membership.workspace.slug)}>
            <button
              type="submit"
              className="sb-btn h-11 px-5 text-sm font-extrabold"
              disabled={!manageable}
              title={!manageable ? "Managers/Admins only" : undefined}
            >
              Run now
            </button>
          </form>
          {!manageable ? (
            <div className="text-sm text-[color:var(--sb-muted)]">
              Only managers/admins can trigger runs in v0.
            </div>
          ) : null}
        </div>

        <div className="mt-7">
          <div className="text-xs font-extrabold sb-title">Recent runs</div>
          {jobRuns.length === 0 ? (
            <div className="mt-2 text-sm text-[color:var(--sb-muted)]">
              No runs yet. Trigger one to generate the first pulse edition.
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              {jobRuns.map((jr) => (
                <div
                  key={jr.id}
                  className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-[color:var(--sb-fg)]">
                      {formatStatus(jr.status)}
                    </div>
                    <div className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-2.5 py-1 text-[11px] text-[color:var(--sb-muted)]">
                      {jr.createdAt.toLocaleString()}
                    </div>
                  </div>
                  {jr.startedAt ? (
                    <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                      Started: {jr.startedAt.toLocaleString()}
                      {jr.finishedAt ? ` | Finished: ${jr.finishedAt.toLocaleString()}` : ""}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                      Not started yet.
                    </div>
                  )}
                  {jr.errorSummary ? (
                    <div className="mt-2 text-xs text-[color:var(--sb-muted)]">
                      Error: {jr.errorSummary}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="sb-card p-7">
        <div className="sb-title text-xl">What it will do</div>
        <div className="mt-3 grid gap-3 text-sm text-[color:var(--sb-muted)] leading-relaxed">
          <div>
            <span className="font-semibold text-[color:var(--sb-fg)]">
              Web research:
            </span>{" "}
            detect new signals (last 72h) aligned with department goals, and
            produce 1–2 cited insight cards.
          </div>
          <div>
            <span className="font-semibold text-[color:var(--sb-fg)]">
              Internal focus:
            </span>{" "}
            derive 3–5 “Today’s Focus” tasks from Gmail/Calendar/Drive context
            (read-only for v0).
          </div>
          <div>
            <span className="font-semibold text-[color:var(--sb-fg)]">
              Delivery:
            </span>{" "}
            store a daily edition so the macOS menu bar app can fetch quickly.
          </div>
        </div>
      </div>
    </div>
  );
}

