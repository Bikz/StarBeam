import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";

export default async function WorkspacePage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const { slug } = params;

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug } },
    include: { workspace: true },
  });

  if (!membership) notFound();

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-5xl px-6 py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="sb-title text-3xl">{membership.workspace.name}</div>
            <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
              Workspace slug:{" "}
              <span className="font-semibold text-[color:var(--sb-fg)]">
                {membership.workspace.slug}
              </span>{" "}
              | Role:{" "}
              <span className="font-semibold text-[color:var(--sb-fg)]">
                {membership.role.toLowerCase()}
              </span>
            </div>
          </div>
          <Link href="/dashboard" className="text-sm text-[color:var(--sb-muted)]">
            &lt;- Dashboard
          </Link>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="sb-card p-7">
            <div className="sb-title text-xl">Quick links</div>
            <div className="mt-4 grid gap-2">
              <Link
                className="sb-btn px-5 py-3 text-sm font-semibold"
                href={`/w/${membership.workspace.slug}/members`}
              >
                Members & invites
              </Link>
              <button
                type="button"
                className="sb-btn px-5 py-3 text-sm font-semibold"
                disabled
                title="Departments land next"
              >
                Departments (next)
              </button>
              <button
                type="button"
                className="sb-btn px-5 py-3 text-sm font-semibold"
                disabled
                title="Goals land next"
              >
                Goals (next)
              </button>
              <button
                type="button"
                className="sb-btn px-5 py-3 text-sm font-semibold"
                disabled
                title="Announcements land next"
              >
                Announcements (next)
              </button>
              <button
                type="button"
                className="sb-btn px-5 py-3 text-sm font-semibold"
                disabled
                title="Integrations land next"
              >
                Google connections (next)
              </button>
              <button
                type="button"
                className="sb-btn px-5 py-3 text-sm font-semibold"
                disabled
                title="Jobs land next"
              >
                Run nightly job now (next)
              </button>
            </div>
          </div>

          <div className="sb-card p-7">
            <div className="sb-title text-xl">Demo narrative</div>
            <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
              In the demo, a manager sets a Marketing goal and a pinned
              announcement, then triggers an overnight run. An employee sees a
              cited web insight and a few focus tasks in the macOS menu bar app.
            </p>

            <div className="mt-6 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-5 text-sm">
              <div className="font-extrabold sb-title">This page is a stub</div>
              <div className="mt-2 text-[color:var(--sb-muted)]">
                Next epics add departments, goals, announcements, integrations,
                and job status.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
