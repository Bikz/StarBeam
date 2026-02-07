import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { runNightlyNow } from "@/app/w/[slug]/jobs/actions";
import { authOptions } from "@/lib/auth";
import { siteOrigin } from "@/lib/siteOrigin";

function isProfileUseful(profile: {
  websiteUrl: string | null;
  description: string | null;
  competitorDomains: string[];
} | null): boolean {
  if (!profile) return false;
  if (profile.websiteUrl && profile.websiteUrl.trim()) return true;
  if (profile.description && profile.description.trim()) return true;
  if (Array.isArray(profile.competitorDomains) && profile.competitorDomains.length > 0) return true;
  return false;
}

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export default async function WorkspaceSetupPage({
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

  const [profile, activeGoals, googleConnections, githubConnections, linearConnections, notionConnections, deviceTokens, pulseEdition, autoFirstJobRun] =
    await Promise.all([
    prisma.workspaceProfile.findUnique({
      where: { workspaceId: membership.workspace.id },
      select: { websiteUrl: true, description: true, competitorDomains: true },
    }),
    prisma.goal.count({
      where: { workspaceId: membership.workspace.id, active: true },
    }),
    prisma.googleConnection.count({
      where: {
        workspaceId: membership.workspace.id,
        ownerUserId: session.user.id,
        status: "CONNECTED",
      },
    }),
    prisma.gitHubConnection.count({
      where: {
        workspaceId: membership.workspace.id,
        ownerUserId: session.user.id,
        status: "CONNECTED",
      },
    }),
    prisma.linearConnection.count({
      where: {
        workspaceId: membership.workspace.id,
        ownerUserId: session.user.id,
        status: "CONNECTED",
      },
    }),
    prisma.notionConnection.count({
      where: {
        workspaceId: membership.workspace.id,
        ownerUserId: session.user.id,
        status: "CONNECTED",
      },
    }),
    prisma.apiRefreshToken.count({
      where: {
        userId: session.user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    }),
    prisma.pulseEdition.findFirst({
      where: { workspaceId: membership.workspace.id, userId: session.user.id },
      select: { id: true },
    }),
    prisma.jobRun.findUnique({
      where: { id: `auto-first:${membership.workspace.id}` },
      select: { status: true, errorSummary: true, createdAt: true, startedAt: true, finishedAt: true },
    }),
  ]);

  const hasProfile = isProfileUseful(profile);
  const hasGoals = activeGoals > 0;
  const hasPulse = Boolean(pulseEdition);
  const hasTools = googleConnections + githubConnections + linearConnections + notionConnections > 0;
  const hasMacApp = deviceTokens > 0;

  // Once the first pulse exists, default to Pulse.
  if (hasPulse) {
    redirect(`/w/${membership.workspace.slug}/pulse`);
  }

  const base = `/w/${membership.workspace.slug}`;

  const steps = [
    {
      done: hasTools,
      title: "Connect tools",
      desc: "Connect at least one source (Google, GitHub, Linear, Notion) to ground the pulse in real context.",
      href: `${base}/integrations`,
      cta: "Open Integrations",
    },
    {
      done: hasMacApp,
      title: "Install macOS app",
      desc: "Sign in on macOS so Starbeam can deliver your pulse in the menu bar.",
      href: `${siteOrigin()}/download`,
      cta: "Download",
    },
    {
      done: hasProfile || hasGoals,
      title: "Tune context (optional)",
      desc: "Add a profile + a few goals to steer what gets researched and ranked.",
      href: `${base}/profile`,
      cta: "Open Settings",
    },
    {
      done: hasPulse,
      title: "Generate the first pulse",
      desc: manageable
        ? "Click Generate, or wait: Starbeam will auto-run within ~10 minutes after your first connector is connected."
        : "Managers/admins trigger runs. Once a run completes, your pulse will appear here and in the macOS app.",
      href: `${base}/jobs`,
      cta: "View Runs",
    },
  ] as const;

  const completed = steps.filter((s) => s.done).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="sb-card p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="sb-title text-xl">Setup</div>
            <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
              This is a short checklist. Once completed, Starbeam drops you into Pulse by default.
            </p>
          </div>
          <div className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-3 py-1 text-[11px] font-semibold text-[color:var(--sb-muted)]">
            {completed}/{steps.length} complete
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          {steps.map((s) => (
            <div
              key={s.title}
              className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div
                      className={[
                        "h-6 w-6 grid place-items-center rounded-full border",
                        s.done
                          ? "border-black/10 dark:border-white/15 bg-black/5 dark:bg-white/10"
                          : "border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10",
                      ].join(" ")}
                      aria-hidden
                    >
                      <span className="text-xs font-extrabold text-[color:var(--sb-fg)]">
                        {s.done ? "✓" : "•"}
                      </span>
                    </div>
                    <div className="sb-title text-lg leading-tight">{s.title}</div>
                  </div>
                  <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                    {s.desc}
                  </div>
                </div>
                {s.title === "Generate the first pulse" ? (
                  <div className="flex flex-wrap gap-2">
                    <form action={runNightlyNow.bind(null, membership.workspace.slug)}>
                      <button
                        type="submit"
                        className="sb-btn sb-btn-primary px-4 py-2 text-xs font-extrabold text-[color:var(--sb-fg)]"
                        disabled={!manageable}
                        title={!manageable ? "Managers/Admins only" : undefined}
                      >
                        Generate now
                      </button>
                    </form>
                    <Link
                      href={s.href}
                      className="sb-btn px-4 py-2 text-xs font-semibold text-[color:var(--sb-fg)]"
                    >
                      {s.cta}
                    </Link>
                  </div>
                ) : (
                  <Link
                    href={s.href}
                    className="sb-btn px-4 py-2 text-xs font-semibold text-[color:var(--sb-fg)]"
                  >
                    {s.cta}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {autoFirstJobRun && autoFirstJobRun.status !== "SUCCEEDED" ? (
          <div className="mt-6 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-5 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            <div className="sb-title text-sm text-[color:var(--sb-fg)]">First pulse run status</div>
            <div className="mt-1">
              Status:{" "}
              <span className="font-semibold text-[color:var(--sb-fg)]">
                {autoFirstJobRun.status.toLowerCase()}
              </span>
            </div>
            {autoFirstJobRun.errorSummary ? (
              <div className="mt-2 text-xs text-[color:var(--sb-muted)]">
                Error: {autoFirstJobRun.errorSummary}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href={`${base}/pulse`}
            className="sb-btn sb-btn-primary px-5 py-2.5 text-xs font-extrabold text-[color:var(--sb-fg)]"
          >
            Go to Pulse
          </Link>
          <Link
            href="/dashboard"
            className="sb-btn px-5 py-2.5 text-xs font-semibold text-[color:var(--sb-fg)]"
          >
            Back to org list
          </Link>
        </div>
      </div>

      <div className="sb-card p-7">
        <div className="sb-title text-xl">Quick explanation</div>
        <div className="mt-3 grid gap-3 text-sm text-[color:var(--sb-muted)] leading-relaxed">
          <div>
            <span className="font-semibold text-[color:var(--sb-fg)]">Context tabs</span>{" "}
            (Profile, Goals, Announcements, Tracks) are the levers that tune what shows up in Pulse.
          </div>
          <div>
            <span className="font-semibold text-[color:var(--sb-fg)]">Pulse</span>{" "}
            is the daily feed: pinned announcements, web research with citations, and focus items derived from integrations.
          </div>
          <div>
            <span className="font-semibold text-[color:var(--sb-fg)]">Runs</span>{" "}
            contains runs and debugging surfaces.
          </div>
        </div>
      </div>
    </div>
  );
}
