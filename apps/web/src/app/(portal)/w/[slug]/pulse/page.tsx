import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import { generateFirstPulseNow } from "@/actions/generate-first-pulse-now";
import PulseReader from "@/components/pulse-reader";
import PageHeader from "@/components/page-header";
import { AdvancedOnly } from "@/components/ui-mode";
import { authOptions } from "@/lib/auth";
import { siteOrigin } from "@/lib/siteOrigin";
import { startGoogleConnect } from "@/app/(portal)/w/[slug]/integrations/googleActions";

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

function hasGoogleAuthEnv(): boolean {
  return (
    typeof process.env.GOOGLE_CLIENT_ID === "string" &&
    process.env.GOOGLE_CLIENT_ID.length > 0 &&
    typeof process.env.GOOGLE_CLIENT_SECRET === "string" &&
    process.env.GOOGLE_CLIENT_SECRET.length > 0
  );
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
  searchParams: Promise<{ edition?: string }>;
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

  if (editions.length === 0) {
    const [googleCount, deviceTokens, bootstrapJobRun, autoFirstJobRun] =
      await Promise.all([
        prisma.googleConnection.count({
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
        prisma.jobRun.findUnique({
          where: { id: `bootstrap:${membership.workspace.id}:${session.user.id}` },
          select: { status: true, errorSummary: true },
        }),
        prisma.jobRun.findUnique({
          where: { id: `auto-first:${membership.workspace.id}:${session.user.id}` },
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
    const googleConnected = googleCount > 0;

    return (
      <div className="sb-card p-7">
        <PageHeader
          title="Starbeam is dreaming…"
          description="Connect one tool, generate your first pulse, and get it delivered in your menu bar."
        />

        <div className="mt-6 grid gap-3">
          <div className="sb-card-inset p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                  Step 1
                </div>
                <div className="sb-title text-base font-extrabold">Connect Google</div>
                <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                  Status:{" "}
                  <span className="font-semibold text-[color:var(--sb-fg)]">
                    {googleConnected ? "connected" : "not connected"}
                  </span>
                </div>
              </div>

              <form action={startGoogleConnect.bind(null, membership.workspace.slug)}>
                <button
                  type="submit"
                  className={sbButtonClass({
                    variant: "primary",
                    className: "h-11 px-5 text-sm font-extrabold",
                  })}
                  disabled={!hasGoogleAuthEnv()}
                  title={!hasGoogleAuthEnv() ? "Google OAuth not configured" : undefined}
                >
                  Connect
                </button>
              </form>
            </div>

            {!hasGoogleAuthEnv() ? (
              <div className="mt-3 text-xs text-[color:var(--sb-muted)]">
                Google OAuth is not configured yet. Set <code>GOOGLE_CLIENT_ID</code> and{" "}
                <code>GOOGLE_CLIENT_SECRET</code>.
              </div>
            ) : null}
          </div>

          <div className="sb-card-inset p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                  Step 2
                </div>
                <div className="sb-title text-base font-extrabold">Generate your first pulse</div>
                <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                  Bootstrap:{" "}
                  <span className="font-semibold text-[color:var(--sb-fg)]">
                    {jobStatusLabel(bootstrapRun?.status)}
                  </span>{" "}
                  <span aria-hidden>·</span>{" "}
                  Run:{" "}
                  <span className="font-semibold text-[color:var(--sb-fg)]">
                    {jobStatusLabel(autoFirstRun?.status)}
                  </span>
                </div>
                {bootstrapRun?.errorSummary || autoFirstRun?.errorSummary ? (
                  <div className="mt-2 text-xs text-[color:var(--sb-muted)] whitespace-pre-wrap">
                    {bootstrapRun?.errorSummary ? `Bootstrap error: ${bootstrapRun.errorSummary}\n` : ""}
                    {autoFirstRun?.errorSummary ? `Run error: ${autoFirstRun.errorSummary}` : ""}
                  </div>
                ) : null}
              </div>

              <form action={generateFirstPulseNow.bind(null, membership.workspace.slug)}>
                <button
                  type="submit"
                  className={sbButtonClass({
                    variant: "primary",
                    className: "h-11 px-5 text-sm font-extrabold",
                  })}
                >
                  Generate now
                </button>
              </form>
            </div>

            <div className="mt-3 text-xs text-[color:var(--sb-muted)] leading-relaxed">
              Tip: if you just connected Google, Starbeam may auto-queue a first run. “Generate now” is always safe.
            </div>
          </div>

          <div className="sb-card-inset p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                  Step 3
                </div>
                <div className="sb-title text-base font-extrabold">Get it in your menu bar</div>
                <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                  {deviceTokens > 0 ? "macOS app signed in" : "not signed in yet"}
                </div>
              </div>
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

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href={`${base}/settings`}
            className={sbButtonClass({
              variant: "secondary",
              className: "h-11 px-5 text-sm font-semibold",
            })}
          >
            Open settings
          </Link>

          <AdvancedOnly>
            <Link
              href={`${base}/jobs`}
              className={sbButtonClass({
                variant: "secondary",
                className: "h-11 px-5 text-sm font-semibold",
              })}
            >
              Advanced status
            </Link>
          </AdvancedOnly>
        </div>
      </div>
    );
  }

  const requestedId = typeof sp.edition === "string" ? sp.edition.trim() : "";
  const selectedId = requestedId && editions.some((e) => e.id === requestedId)
    ? requestedId
    : editions[0]?.id ?? "";

  const selected = await prisma.pulseEdition.findFirst({
    where: { id: selectedId, workspaceId: membership.workspace.id, userId: session.user.id },
    include: { cards: { orderBy: [{ priority: "desc" }, { createdAt: "asc" }] } },
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
                      {e._count.cards} cards <span aria-hidden>·</span> {statusLabel(e.status)}
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
