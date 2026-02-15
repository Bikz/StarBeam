import Link from "next/link";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import { createOrgWorkspace } from "@/app/dashboard/actions";
import AppShell from "@/components/app-shell";
import CopyPill from "@/components/copy-pill";
import PageHeader from "@/components/page-header";
import { authOptions } from "@/lib/auth";
import { requireBetaAccessOrRedirect } from "@/lib/betaAccess";
import { isOnboardingV2Enabled } from "@/lib/flags";

function isProfileUseful(
  profile: {
    websiteUrl: string | null;
    description: string | null;
    competitorDomains: string[];
  } | null,
): boolean {
  if (!profile) return false;
  if (profile.websiteUrl?.trim()) return true;
  if (profile.description?.trim()) return true;
  if (
    Array.isArray(profile.competitorDomains) &&
    profile.competitorDomains.length > 0
  )
    return true;
  return false;
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return (
      <div className="sb-bg">
        <div className="sb-container py-16">
          <div className="sb-card p-8">
            <div className="sb-title text-2xl">Sign in required</div>
            <p className="mt-2 text-sm text-[color:var(--sb-muted)]">
              Sign in to access your dashboard.
            </p>
            <Link
              href="/"
              className={sbButtonClass({
                variant: "primary",
                className: "mt-5 px-5 py-3",
              })}
            >
              Go to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const cookieStore = await cookies();
  const ref = cookieStore.get("sb_ref")?.value ?? "";
  if (ref) {
    // Claim referral before evaluating beta access (cookie needs clearing in a route handler).
    redirect("/beta/claim?next=/dashboard");
  }

  await requireBetaAccessOrRedirect(session.user.id);

  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  const workspaceIds = memberships.map((m) => m.workspaceId);

  const [activeGoals, connections, editions, profiles] = await Promise.all([
    prisma.goal.groupBy({
      by: ["workspaceId"],
      where: { workspaceId: { in: workspaceIds }, active: true },
      _count: { _all: true },
    }),
    prisma.googleConnection.groupBy({
      by: ["workspaceId"],
      where: {
        workspaceId: { in: workspaceIds },
        ownerUserId: session.user.id,
        status: "CONNECTED",
      },
      _count: { _all: true },
    }),
    prisma.pulseEdition.findMany({
      where: { workspaceId: { in: workspaceIds }, userId: session.user.id },
      select: { workspaceId: true },
      distinct: ["workspaceId"],
    }),
    prisma.workspaceProfile.findMany({
      where: { workspaceId: { in: workspaceIds } },
      select: {
        workspaceId: true,
        websiteUrl: true,
        description: true,
        competitorDomains: true,
      },
    }),
  ]);

  const goalsByWorkspace = new Map(
    activeGoals.map((g) => [g.workspaceId, g._count._all]),
  );
  const googleByWorkspace = new Map(
    connections.map((c) => [c.workspaceId, c._count._all]),
  );
  const hasEdition = new Set(editions.map((e) => e.workspaceId));
  const profileByWorkspace = new Map(profiles.map((p) => [p.workspaceId, p]));

  const orgCount = memberships.filter((m) => m.workspace.type === "ORG").length;
  const personalCount = memberships.filter(
    (m) => m.workspace.type !== "ORG",
  ).length;
  const onboardingV2 = isOnboardingV2Enabled();

  return (
    <AppShell
      user={{ email: session.user.email ?? "unknown" }}
      workspaces={memberships.map((m) => ({
        slug: m.workspace.slug,
        name: m.workspace.name,
        type: m.workspace.type,
        role: m.role,
      }))}
      activeWorkspace={null}
    >
      <div className="grid gap-6">
        <section className="sb-card p-6 sm:p-7">
          <PageHeader
            title="Overview"
            description="Open a workspace to manage context and view your latest pulse."
            size="lg"
          />

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="sb-card-inset px-4 py-3">
              <div className="text-[11px] font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                Workspaces
              </div>
              <div className="mt-1 sb-title text-2xl font-extrabold leading-none">
                {memberships.length}
              </div>
            </div>
            <div className="sb-card-inset px-4 py-3">
              <div className="text-[11px] font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                Orgs
              </div>
              <div className="mt-1 sb-title text-2xl font-extrabold leading-none">
                {orgCount}
              </div>
              <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                Personal: {personalCount}
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-start">
          <section className="sb-card p-6 sm:p-7">
            <PageHeader title="Your workspaces" />

            {memberships.length === 0 ? (
              <div className="mt-4 sb-card-inset p-5">
                <div className="sb-title text-base font-extrabold">
                  No workspaces found
                </div>
                <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                  Personal workspace creation may have failed. Try signing out
                  and back in.
                </div>
                <Link
                  href="/api/auth/signout?callbackUrl=/"
                  className={sbButtonClass({
                    variant: "primary",
                    className: "mt-4 px-4 py-2 text-xs font-semibold",
                  })}
                >
                  Sign out to retry
                </Link>
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                {memberships.map((m) => {
                  const goalCount = goalsByWorkspace.get(m.workspaceId) ?? 0;
                  const googleCount = googleByWorkspace.get(m.workspaceId) ?? 0;
                  const editionReady = hasEdition.has(m.workspaceId);
                  const profile = profileByWorkspace.get(m.workspaceId) ?? null;

                  const todo: Array<{ label: string; href: string }> = [];
                  if (m.workspace.type === "ORG" && !isProfileUseful(profile)) {
                    todo.push({
                      label: "Add profile",
                      href: `/w/${m.workspace.slug}/profile`,
                    });
                  }
                  if (goalCount === 0) {
                    todo.push({
                      label: "Add goals",
                      href: `/w/${m.workspace.slug}/tracks`,
                    });
                  }
                  if (googleCount === 0) {
                    todo.push({
                      label: "Connect Google",
                      href: `/w/${m.workspace.slug}/google`,
                    });
                  }
                  if (!editionReady) {
                    todo.push({
                      label: "Finish setup",
                      href: onboardingV2
                        ? `/w/${m.workspace.slug}/onboarding`
                        : `/w/${m.workspace.slug}/settings`,
                    });
                  }

                  return (
                    <div key={m.id} className="sb-card-inset p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-[220px]">
                          <div className="sb-title text-lg font-extrabold leading-tight">
                            {m.workspace.name}
                          </div>
                          <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                            {m.workspace.type === "ORG"
                              ? "Org workspace"
                              : "Personal"}{" "}
                            <span aria-hidden>·</span>{" "}
                            <span className="font-semibold text-[color:var(--sb-fg)]">
                              {m.role.toLowerCase()}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <CopyPill
                            value={m.workspace.slug}
                            label={`id:${m.workspace.slug}`}
                            title="Click to copy workspace ID"
                          />
                          <span className="text-[11px] font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                            {m.workspace.type}
                          </span>
                        </div>
                      </div>

                      {todo.length ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <div className="text-[11px] font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                            Next:
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {todo.slice(0, 3).map((t) => (
                              <Link
                                key={t.label}
                                href={t.href}
                                className="sb-pill hover:text-[color:var(--sb-fg)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
                              >
                                {t.label}
                              </Link>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Link
                          href={`/w/${m.workspace.slug}`}
                          className={sbButtonClass({
                            variant: "primary",
                            className: "px-4 py-2 text-xs font-semibold",
                          })}
                        >
                          Open
                        </Link>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--sb-muted)]">
                          <Link
                            href={`/w/${m.workspace.slug}/members`}
                            className="hover:underline"
                          >
                            People
                          </Link>
                          <span aria-hidden className="opacity-70">
                            ·
                          </span>
                          <Link
                            href={`/w/${m.workspace.slug}/google`}
                            className="hover:underline"
                          >
                            Integrations
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="sb-card p-6 sm:p-7">
            <PageHeader
              title="Create org workspace"
              description="Create a shared workspace for a team or project. Add goals, connect Google, and run overnight pulses."
            />

            <form action={createOrgWorkspace} className="mt-5 grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="text-[color:var(--sb-muted)]">Org name</span>
                <input
                  name="name"
                  placeholder="Acme SaaS…"
                  autoComplete="organization"
                  className="sb-input"
                  required
                  minLength={2}
                  maxLength={64}
                />
              </label>
              <button
                type="submit"
                className={sbButtonClass({
                  variant: "primary",
                  className: "h-11 px-5 text-sm font-extrabold",
                })}
              >
                Create workspace
              </button>
            </form>

            <div className="mt-6 sb-card-inset p-5">
              <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                What happens next
              </div>
              <ol className="mt-3 grid gap-3 text-sm">
                <li className="flex gap-3">
                  <div className="mt-0.5 h-6 w-6 flex-none rounded-full bg-black/5 dark:bg-white/10 grid place-items-center border border-black/10 dark:border-white/15">
                    <span className="text-xs font-extrabold text-[color:var(--sb-fg)]">
                      1
                    </span>
                  </div>
                  <div>
                    <div className="font-semibold text-[color:var(--sb-fg)]">
                      Connect Google (read-only)
                    </div>
                    <div className="text-[color:var(--sb-muted)]">
                      Gmail + Calendar add context for better focus suggestions.
                    </div>
                  </div>
                </li>
                <li className="flex gap-3">
                  <div className="mt-0.5 h-6 w-6 flex-none rounded-full bg-black/5 dark:bg-white/10 grid place-items-center border border-black/10 dark:border-white/15">
                    <span className="text-xs font-extrabold text-[color:var(--sb-fg)]">
                      2
                    </span>
                  </div>
                  <div>
                    <div className="font-semibold text-[color:var(--sb-fg)]">
                      Add goals and announcements
                    </div>
                    <div className="text-[color:var(--sb-muted)]">
                      Give the agent deliberate context to optimize for.
                    </div>
                  </div>
                </li>
                <li className="flex gap-3">
                  <div className="mt-0.5 h-6 w-6 flex-none rounded-full bg-black/5 dark:bg-white/10 grid place-items-center border border-black/10 dark:border-white/15">
                    <span className="text-xs font-extrabold text-[color:var(--sb-fg)]">
                      3
                    </span>
                  </div>
                  <div>
                    <div className="font-semibold text-[color:var(--sb-fg)]">
                      Nightly job produces tomorrow’s pulse
                    </div>
                    <div className="text-[color:var(--sb-muted)]">
                      Web research with citations + your internal context.
                    </div>
                  </div>
                </li>
              </ol>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
