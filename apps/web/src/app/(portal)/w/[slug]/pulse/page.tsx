import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import PulseReader from "@/components/pulse-reader";
import PageHeader from "@/components/page-header";
import { authOptions } from "@/lib/auth";
import { isActionStateServerEnabled, isOnboardingV2Enabled } from "@/lib/flags";
import { decidePulseGate } from "@/lib/pulseOnboardingGating";
import { siteOrigin } from "@/lib/siteOrigin";

function formatEditionDate(d: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function statusLabel(status: string): string {
  return status.toLowerCase().replaceAll("_", " ");
}

function statusPill(status: string) {
  return <div className="sb-pill">{statusLabel(status)}</div>;
}

function jobStatusLabel(status: string | null | undefined): string {
  const s = (status ?? "").trim();
  if (!s) return "not queued";
  return s.toLowerCase().replaceAll("_", " ");
}

export default async function PulsePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ edition?: string; queued?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const [{ slug }, sp] = await Promise.all([params, searchParams]);

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug } },
    include: { workspace: true },
  });
  if (!membership) notFound();

  const base = `/w/${membership.workspace.slug}`;
  const onboardingV2 = isOnboardingV2Enabled();
  const actionStateServerEnabled = isActionStateServerEnabled();

  const editions = await prisma.pulseEdition.findMany({
    where: { workspaceId: membership.workspace.id, userId: session.user.id },
    orderBy: { editionDate: "desc" },
    take: 30,
    select: {
      id: true,
      editionDate: true,
      status: true,
      _count: { select: { cards: true } },
    },
  });

  const gate = decidePulseGate({
    editionsCount: editions.length,
    onboardingEnabled: onboardingV2,
    onboardingCompletedAt: membership.onboardingCompletedAt,
  });

  if (gate.kind === "redirect_onboarding") {
    redirect(`${base}/onboarding`);
  }

  if (gate.kind === "render_generating") {
    const [bootstrapJobRun, autoFirstJobRun] = await Promise.all([
      prisma.jobRun.findUnique({
        where: {
          id: `bootstrap:${membership.workspace.id}:${session.user.id}`,
        },
        select: { status: true, errorSummary: true },
      }),
      prisma.jobRun.findUnique({
        where: {
          id: `auto-first:${membership.workspace.id}:${session.user.id}`,
        },
        select: { status: true, errorSummary: true },
      }),
    ]);

    // Backward-compat: older deployments stored bootstrap/auto-first as workspace-scoped ids.
    const [bootstrapJobRunCompat, autoFirstJobRunCompat] = await Promise.all([
      bootstrapJobRun
        ? Promise.resolve(null)
        : prisma.jobRun.findUnique({
            where: { id: `bootstrap:${membership.workspace.id}` },
            select: { status: true, errorSummary: true },
          }),
      autoFirstJobRun
        ? Promise.resolve(null)
        : prisma.jobRun.findUnique({
            where: { id: `auto-first:${membership.workspace.id}` },
            select: { status: true, errorSummary: true },
          }),
    ]);

    const bootstrapRun = bootstrapJobRun ?? bootstrapJobRunCompat;
    const autoFirstRun = autoFirstJobRun ?? autoFirstJobRunCompat;

    const dl = `${siteOrigin()}/download`;

    return (
      <div className="sb-card p-7">
        <PageHeader
          title="Generating your first pulse"
          description="Starbeam generates a pulse each day based on your context and connected sources. You can add teammates and OpenClaws to expand coverage across your workspace."
        />

        <div className="mt-6 sb-card-inset p-5">
          <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
            Status
          </div>
          <div className="mt-2 grid gap-2 text-sm text-[color:var(--sb-muted)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[color:var(--sb-fg)]">
                Bootstrap
              </span>
              <span aria-hidden>·</span>
              <span>{jobStatusLabel(bootstrapRun?.status)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[color:var(--sb-fg)]">
                Run
              </span>
              <span aria-hidden>·</span>
              <span>{jobStatusLabel(autoFirstRun?.status)}</span>
            </div>
          </div>

          {bootstrapRun?.errorSummary || autoFirstRun?.errorSummary ? (
            <div className="mt-4 text-xs text-[color:var(--sb-muted)] whitespace-pre-wrap">
              {bootstrapRun?.errorSummary
                ? `Bootstrap error: ${bootstrapRun.errorSummary}\n`
                : ""}
              {autoFirstRun?.errorSummary
                ? `Run error: ${autoFirstRun.errorSummary}`
                : ""}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href={`${base}/pulse?queued=1`}
              className={sbButtonClass({
                variant: "primary",
                className: "h-11 px-5 text-sm font-extrabold",
              })}
            >
              Refresh
            </Link>
            <Link
              href={`${base}/integrations`}
              className={sbButtonClass({
                variant: "secondary",
                className: "h-11 px-5 text-sm font-semibold",
              })}
            >
              Connect integrations
            </Link>
            <a
              href={dl}
              className={sbButtonClass({
                variant: "secondary",
                className: "h-11 px-5 text-sm font-semibold",
              })}
            >
              Download macOS app
            </a>
          </div>
        </div>
      </div>
    );
  }

  const requestedId = typeof sp.edition === "string" ? sp.edition.trim() : "";
  const selectedId =
    requestedId && editions.some((e) => e.id === requestedId)
      ? requestedId
      : (editions[0]?.id ?? "");

  const selected = await prisma.pulseEdition.findFirst({
    where: {
      id: selectedId,
      workspaceId: membership.workspace.id,
      userId: session.user.id,
    },
    include: {
      cards: { orderBy: [{ priority: "desc" }, { createdAt: "asc" }] },
    },
  });

  if (!selected) {
    redirect(`${base}/pulse`);
  }

  const history = editions.filter((e) => e.id !== selectedId);

  return (
    <div id="top" className="grid gap-6">
      <div className="min-w-0">
        <PulseReader
          workspaceSlug={membership.workspace.slug}
          edition={{
            editionDateIso: selected.editionDate.toISOString(),
            status: selected.status,
          }}
          actionStateServerEnabled={actionStateServerEnabled}
          cards={selected.cards.map((c) => ({
            id: c.id,
            kind: c.kind,
            title: c.title,
            body: c.body,
            why: c.why,
            action: c.action,
            priority: c.priority,
            sources: c.sources,
            createdAt: c.createdAt.toISOString(),
          }))}
        />
      </div>

      <section id="history" className="sb-card p-6 sm:p-7">
        <PageHeader title="History" description={`${editions.length} saved`} />

        {history.length ? (
          <div className="mt-5 grid gap-2">
            {history.map((e) => (
              <Link
                key={e.id}
                href={`${base}/pulse?edition=${encodeURIComponent(e.id)}#top`}
                className={[
                  "sb-card-inset px-4 py-3 text-sm transition",
                  "hover:border-black/10 hover:bg-black/[0.03] dark:hover:border-white/15 dark:hover:bg-white/[0.06]",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-[color:var(--sb-fg)] truncate">
                      {formatEditionDate(e.editionDate)}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                      {e._count.cards} cards <span aria-hidden>·</span>{" "}
                      {statusLabel(e.status)}
                    </div>
                  </div>
                  {statusPill(e.status)}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-5 text-sm text-[color:var(--sb-muted)]">
            No previous pulses yet.
          </div>
        )}

        <div className="mt-6">
          <Link
            href={`${base}/settings`}
            className={sbButtonClass({
              variant: "secondary",
              className: "h-11 px-5 text-sm font-semibold",
            })}
          >
            Settings
          </Link>
        </div>
      </section>
    </div>
  );
}
