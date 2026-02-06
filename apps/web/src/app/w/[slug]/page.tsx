import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";

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

  const [profile, activeGoals, googleConnections, pulseEdition] = await Promise.all([
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
    prisma.pulseEdition.findFirst({
      where: { workspaceId: membership.workspace.id, userId: session.user.id },
      select: { id: true },
    }),
  ]);

  const hasProfile = isProfileUseful(profile);
  const hasGoals = activeGoals > 0;
  const hasGoogle = googleConnections > 0;
  const hasPulse = Boolean(pulseEdition);

  // Definition of "done": enough context + an actual pulse generated.
  if (hasProfile && hasGoals && hasGoogle && hasPulse) {
    redirect(`/w/${membership.workspace.slug}/pulse`);
  }

  const base = `/w/${membership.workspace.slug}`;

  const steps = [
    {
      done: hasProfile,
      title: "Add org profile",
      desc: "Website, description, and competitors help scope web research.",
      href: `${base}/profile`,
      cta: "Open Org Profile",
    },
    {
      done: hasGoals,
      title: "Set 1–3 goals",
      desc: "Goals are the strongest driver for what gets researched and ranked.",
      href: `${base}/goals`,
      cta: "Open Goals",
    },
    {
      done: hasGoogle,
      title: "Connect Google (read-only)",
      desc: "Used to derive Today’s Focus and your agenda for the pulse.",
      href: `${base}/google`,
      cta: "Open Integrations",
    },
    {
      done: hasPulse,
      title: "Generate the first pulse",
      desc: "Run the job once to produce the latest pulse cards.",
      href: `${base}/jobs`,
      cta: "Open Advanced",
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
                <Link
                  href={s.href}
                  className="sb-btn px-4 py-2 text-xs font-semibold text-[color:var(--sb-fg)]"
                >
                  {s.cta}
                </Link>
              </div>
            </div>
          ))}
        </div>

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
            (Org Profile, Goals, Announcements, Tracks) are the levers that tune what shows up in Pulse.
          </div>
          <div>
            <span className="font-semibold text-[color:var(--sb-fg)]">Pulse</span>{" "}
            is the daily feed: pinned announcements, web research with citations, and focus items derived from integrations.
          </div>
          <div>
            <span className="font-semibold text-[color:var(--sb-fg)]">Advanced</span>{" "}
            contains Jobs and debugging surfaces.
          </div>
        </div>
      </div>
    </div>
  );
}
