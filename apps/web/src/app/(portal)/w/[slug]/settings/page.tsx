import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { generateFirstPulseNow } from "@/actions/generate-first-pulse-now";
import PageHeader from "@/components/page-header";
import UiModeToggle from "@/components/ui-mode-toggle";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { siteOrigin } from "@/lib/siteOrigin";
import { startGoogleConnect, disconnectGoogleConnection } from "@/app/(portal)/w/[slug]/integrations/googleActions";

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

function statusLabel(status: string | null | undefined): string {
  const s = (status ?? "").trim();
  if (!s) return "not queued";
  return s.toLowerCase().replaceAll("_", " ");
}

function hasGoogleAuthEnv(): boolean {
  return (
    typeof process.env.GOOGLE_CLIENT_ID === "string" &&
    process.env.GOOGLE_CLIENT_ID.length > 0 &&
    typeof process.env.GOOGLE_CLIENT_SECRET === "string" &&
    process.env.GOOGLE_CLIENT_SECRET.length > 0
  );
}

export default async function SettingsPage({
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
  const base = `/w/${membership.workspace.slug}`;
  const dl = `${siteOrigin()}/download`;
  const isAdmin = isAdminEmail(session.user.email);

  const [edition, googleConnections, deviceTokens, bootstrapJobRun, autoFirstJobRun] =
    await Promise.all([
      prisma.pulseEdition.findFirst({
        where: { workspaceId: membership.workspace.id, userId: session.user.id },
        select: { id: true },
      }),
      prisma.googleConnection.findMany({
        where: { workspaceId: membership.workspace.id, ownerUserId: session.user.id },
        select: { id: true, googleAccountEmail: true, status: true, scopes: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 3,
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
        select: { status: true, errorSummary: true, createdAt: true, startedAt: true, finishedAt: true },
      }),
      prisma.jobRun.findUnique({
        where: { id: `auto-first:${membership.workspace.id}:${session.user.id}` },
        select: { status: true, errorSummary: true, createdAt: true, startedAt: true, finishedAt: true },
      }),
    ]);

  // Backward-compat: older deployments stored bootstrap/auto-first as workspace-scoped ids.
  const [bootstrapJobRunCompat, autoFirstJobRunCompat] = await Promise.all([
    bootstrapJobRun
      ? Promise.resolve(null)
      : prisma.jobRun.findUnique({
          where: { id: `bootstrap:${membership.workspace.id}` },
          select: { status: true, errorSummary: true, createdAt: true, startedAt: true, finishedAt: true },
        }),
    autoFirstJobRun
      ? Promise.resolve(null)
      : prisma.jobRun.findUnique({
          where: { id: `auto-first:${membership.workspace.id}` },
          select: { status: true, errorSummary: true, createdAt: true, startedAt: true, finishedAt: true },
        }),
  ]);

  const bootstrapRun = bootstrapJobRun ?? bootstrapJobRunCompat;
  const autoFirstRun = autoFirstJobRun ?? autoFirstJobRunCompat;

  const googleConnected = googleConnections.some((c) => c.status === "CONNECTED");

  return (
    <div className="grid gap-6">
      <section className="sb-card p-7">
        <PageHeader
          title="Settings"
          description="Connect tools, add context, and keep Starbeam calm."
        />

        {!edition ? (
          <div className="mt-6 grid gap-4">
            <div className="sb-card-inset p-5">
              <div className="sb-title text-lg font-extrabold">Get your first pulse</div>
              <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                Starbeam works best with real context, but you can generate a first pulse any time.
              </div>

              <div className="mt-5 grid gap-3">
                <div className="sb-card-inset p-4">
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
                        className="sb-btn sb-btn-primary h-10 px-4 text-xs font-extrabold"
                        disabled={!hasGoogleAuthEnv()}
                        title={!hasGoogleAuthEnv() ? "Google OAuth not configured" : undefined}
                      >
                        Connect
                      </button>
                    </form>
                  </div>
                  {!hasGoogleAuthEnv() ? (
                    <div className="mt-2 text-xs text-[color:var(--sb-muted)]">
                      Google OAuth is not configured yet. Set <code>GOOGLE_CLIENT_ID</code> and{" "}
                      <code>GOOGLE_CLIENT_SECRET</code>.
                    </div>
                  ) : null}
                </div>

                <div className="sb-card-inset p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                        Step 2
                      </div>
                      <div className="sb-title text-base font-extrabold">Generate your first pulse</div>
                      <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                        Bootstrap:{" "}
                        <span className="font-semibold text-[color:var(--sb-fg)]">
                          {statusLabel(bootstrapRun?.status)}
                        </span>{" "}
                        <span aria-hidden>·</span>{" "}
                        Run:{" "}
                        <span className="font-semibold text-[color:var(--sb-fg)]">
                          {statusLabel(autoFirstRun?.status)}
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
                      <button type="submit" className="sb-btn sb-btn-primary h-10 px-4 text-xs font-extrabold">
                        Generate now
                      </button>
                    </form>
                  </div>
                </div>

                <div className="sb-card-inset p-4">
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
                    <a href={dl} className="sb-btn h-10 px-4 text-xs font-semibold">
                      Download macOS app
                    </a>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link href={`${base}/pulse`} className="sb-btn sb-btn-primary h-11 px-5 text-sm font-extrabold">
                  Go to Pulse
                </Link>
                <div className="text-xs text-[color:var(--sb-muted)]">
                  Tip: pulse generation may take a few minutes.
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="sb-card p-7">
        <PageHeader
          title="Tools"
          description="Connect one source now and keep the rest optional."
        />

        <div className="mt-6 grid gap-3">
          <div className="sb-card-inset p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="sb-title text-base font-extrabold">Google</div>
                <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                  {googleConnections.length === 0
                    ? "Not connected"
                    : googleConnections[0]?.googleAccountEmail
                      ? `Connected as ${googleConnections[0].googleAccountEmail}`
                      : "Connected"}
                </div>
              </div>

              {googleConnections.length === 0 ? (
                <form action={startGoogleConnect.bind(null, membership.workspace.slug)}>
                  <button
                    type="submit"
                    className="sb-btn sb-btn-primary h-11 px-5 text-sm font-extrabold"
                    disabled={!hasGoogleAuthEnv()}
                    title={!hasGoogleAuthEnv() ? "Google OAuth not configured" : undefined}
                  >
                    Connect Google
                  </button>
                </form>
              ) : (
                    <form
                      action={disconnectGoogleConnection.bind(
                        null,
                        membership.workspace.slug,
                        googleConnections[0]!.id,
                      )}
                    >
                  <button type="submit" className="sb-btn h-11 px-5 text-sm font-semibold">
                    Disconnect
                  </button>
                </form>
              )}
            </div>

            <div className="mt-4 text-xs text-[color:var(--sb-muted)] leading-relaxed">
              Read-only in v0. Used for Focus and Calendar signals, plus context for better pulses.
            </div>
          </div>

          <details className="sb-card-inset p-5">
            <summary className="cursor-pointer text-sm font-semibold text-[color:var(--sb-fg)]">
              Advanced tools
            </summary>
            <div className="mt-3 grid gap-3 text-sm text-[color:var(--sb-muted)] leading-relaxed">
              <div>
                GitHub, Linear, and Notion connectors are available, but optional. Use them when you want tighter
                context.
              </div>
              <div>
                <Link href={`${base}/integrations`} className="sb-btn sb-btn-primary h-11 px-5 text-sm font-extrabold">
                  Open integrations
                </Link>
              </div>
            </div>
          </details>
        </div>
      </section>

      <section className="sb-card p-7">
        <PageHeader
          title="Context"
          description="A little context goes a long way. Keep it lightweight."
        />

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href={`${base}/profile`} className="sb-card-inset p-5">
            <div className="sb-title text-base font-extrabold">Profile</div>
            <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
              Company or project description
            </div>
            <div className="mt-4 inline-flex sb-btn px-4 py-2 text-xs font-semibold">
              Open
            </div>
          </Link>
          <Link href={`${base}/tracks`} className="sb-card-inset p-5">
            <div className="sb-title text-base font-extrabold">Tracks and goals</div>
            <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
              Up to 5 active goals per track
            </div>
            <div className="mt-4 inline-flex sb-btn px-4 py-2 text-xs font-semibold">
              Open
            </div>
          </Link>
          <Link href={`${base}/announcements`} className="sb-card-inset p-5">
            <div className="sb-title text-base font-extrabold">Announcements</div>
            <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
              Pinned notes that show up in pulses
            </div>
            <div className="mt-4 inline-flex sb-btn px-4 py-2 text-xs font-semibold">
              Open
            </div>
          </Link>
          <Link href={`${base}/members`} className="sb-card-inset p-5">
            <div className="sb-title text-base font-extrabold">People</div>
            <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
              Members and invites
            </div>
            <div className="mt-4 inline-flex sb-btn px-4 py-2 text-xs font-semibold">
              Open
            </div>
          </Link>
        </div>

        {!manageable ? (
          <div className="mt-4 text-xs text-[color:var(--sb-muted)]">
            Note: some context is manager/admin-only in v0. You can still connect your own tools and get personal pulses.
          </div>
        ) : null}
      </section>

      <section className="sb-card p-7">
        <PageHeader
          title="Advanced mode"
          description="Advanced mode reveals additional pages (Integrations, Tracks, Runs). Keep it off unless you’re actively tuning."
        />

        <div className="mt-6 grid gap-4">
          <UiModeToggle />
          <div className="text-xs text-[color:var(--sb-muted)] leading-relaxed">
            You can always return here via{" "}
            <Link href={`${base}/settings`} className="underline underline-offset-2">
              Settings
            </Link>
            .
          </div>
          {isAdmin ? (
            <div className="pt-2">
              <Link href="/admin/beta-keys" className="sb-btn h-11 px-5 text-sm font-semibold">
                Admin: beta keys
              </Link>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
