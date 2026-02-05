import Link from "next/link";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { createOrgWorkspace } from "@/app/dashboard/actions";
import { authOptions } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return (
      <div className="sb-bg">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="sb-card p-8">
            <div className="sb-title text-2xl">Sign in required</div>
            <p className="mt-2 text-sm text-[color:var(--sb-muted)]">
              Starbeam uses Google sign-in for the demo.
            </p>
            <Link href="/" className="sb-btn inline-flex mt-5 px-5 py-3">
              Go to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-5xl px-6 py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="sb-title text-3xl">Dashboard</div>
            <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
              Signed in as{" "}
              <span className="font-semibold text-[color:var(--sb-fg)]">
                {session.user.email}
              </span>
            </div>
          </div>
          <Link href="/" className="text-sm text-[color:var(--sb-muted)]">
            &lt;- Home
          </Link>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="sb-card p-7">
            <div className="flex items-center justify-between">
              <div className="sb-title text-xl">Your workspaces</div>
              <div className="text-xs text-[color:var(--sb-muted)]">
                v0: invite-only org join
              </div>
            </div>

            {memberships.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-5 text-sm text-[color:var(--sb-muted)]">
                No workspaces yet. Creating your personal workspace may have
                failed. Try signing out and back in.
              </div>
            ) : (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {memberships.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="sb-title text-lg leading-tight">
                          {m.workspace.name}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                          {m.workspace.type === "ORG" ? "Org" : "Personal"} -{" "}
                          {m.role.toLowerCase()}
                        </div>
                      </div>
                      <div className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-2.5 py-1 text-[11px] text-[color:var(--sb-muted)]">
                        {m.workspace.slug}
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Link
                        href={`/w/${m.workspace.slug}`}
                        className="sb-btn px-4 py-2 text-xs font-semibold"
                      >
                        Open
                      </Link>
                      <Link
                        href={`/w/${m.workspace.slug}/members`}
                        className="sb-btn px-4 py-2 text-xs font-semibold"
                      >
                        Members
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sb-card p-7">
            <div className="sb-title text-xl">Create an org</div>
            <p className="mt-2 text-sm text-[color:var(--sb-muted)]">
              For the demo: CEO creates an org workspace, sets a Marketing goal,
              and an employee gets a cited web insight the next morning.
            </p>

            <form action={createOrgWorkspace} className="mt-5 grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="text-[color:var(--sb-muted)]">Org name</span>
                <input
                  name="name"
                  placeholder="Acme SaaS"
                  className="h-11 rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-4 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
                  required
                  minLength={2}
                  maxLength={64}
                />
              </label>
              <button
                type="submit"
                className="sb-btn h-11 px-5 text-sm font-extrabold"
              >
                Create workspace
              </button>
            </form>

            <div className="mt-6 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-xs text-[color:var(--sb-muted)] leading-relaxed">
              Next: departments, goals, announcements, Google connections, and
              nightly jobs.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
