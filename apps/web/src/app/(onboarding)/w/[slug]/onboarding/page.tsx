import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { runNightlyNow } from "@/app/(portal)/w/[slug]/jobs/actions";
import ThemeToggle from "@/components/theme-toggle";
import { authOptions } from "@/lib/auth";
import { siteOrigin } from "@/lib/siteOrigin";

type Step = "tools" | "download" | "context" | "generate";

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

function isProfileUseful(profile: {
  websiteUrl: string | null;
  description: string | null;
  competitorDomains: string[];
} | null): boolean {
  if (!profile) return false;
  if (profile.websiteUrl?.trim()) return true;
  if (profile.description?.trim()) return true;
  if (Array.isArray(profile.competitorDomains) && profile.competitorDomains.length > 0) return true;
  return false;
}

function normalizeStep(raw: unknown): Step | null {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "tools" || s === "download" || s === "context" || s === "generate") return s;
  return null;
}

function nextStep(step: Step): Step {
  if (step === "tools") return "download";
  if (step === "download") return "context";
  if (step === "context") return "generate";
  return "generate";
}

function prevStep(step: Step): Step {
  if (step === "generate") return "context";
  if (step === "context") return "download";
  if (step === "download") return "tools";
  return "tools";
}

function stepIndex(step: Step): number {
  if (step === "tools") return 1;
  if (step === "download") return 2;
  if (step === "context") return 3;
  return 4;
}

function statusLabel(status: string | null | undefined): string {
  const s = (status ?? "").trim();
  if (!s) return "not queued";
  return s.toLowerCase().replaceAll("_", " ");
}

export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ step?: string }>;
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
  const base = `/w/${membership.workspace.slug}`;

  const [
    profile,
    activeGoals,
    googleConnections,
    githubConnections,
    linearConnections,
    notionConnections,
    deviceTokens,
    pulseEdition,
    bootstrapJobRun,
    autoFirstJobRun,
  ] = await Promise.all([
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

  // If the first pulse exists, this flow is done.
  if (pulseEdition) {
    redirect(`${base}/pulse`);
  }

  const hasProfile = isProfileUseful(profile);
  const hasGoals = activeGoals > 0;
  const hasTools = googleConnections + githubConnections + linearConnections + notionConnections > 0;
  const hasMacApp = deviceTokens > 0;
  const hasContext = hasProfile || hasGoals;

  const recommended: Step = !hasTools
    ? "tools"
    : !hasMacApp
      ? "download"
      : !hasContext
        ? "context"
        : "generate";

  const requested = normalizeStep(sp.step);
  const step = requested ?? recommended;

  // Keep the URL stable: if no step param, land on the recommended step.
  if (!requested && step !== "tools") {
    redirect(`${base}/onboarding?step=${encodeURIComponent(step)}`);
  }

  const progress = `${stepIndex(step)}/4`;

  const chrome = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="sb-card-inset grid h-10 w-10 place-items-center">
          <span className="sb-title text-base font-extrabold" aria-hidden>
            *
          </span>
        </div>
        <div>
          <div className="sb-title text-sm font-extrabold leading-tight">
            {membership.workspace.name}
          </div>
          <div className="text-xs text-[color:var(--sb-muted)]">
            Setup
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-3 py-1 text-[11px] font-semibold text-[color:var(--sb-muted)]">
          {progress}
        </div>
        <ThemeToggle />
        <Link
          href="/dashboard"
          className="sb-btn inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[color:var(--sb-fg)]"
        >
          Exit
        </Link>
      </div>
    </div>
  );

  const nav = (
    <div className="mt-5 flex items-center justify-between">
      <Link
        href={`${base}/onboarding?step=${encodeURIComponent(prevStep(step))}`}
        className="sb-btn px-4 py-2 text-xs font-semibold text-[color:var(--sb-fg)]"
      >
        Back
      </Link>
      <Link
        href={`${base}/onboarding?step=${encodeURIComponent(nextStep(step))}`}
        className="sb-btn px-4 py-2 text-xs font-semibold text-[color:var(--sb-fg)]"
      >
        Skip for now
      </Link>
    </div>
  );

  const toolsStep = (
    <>
      <div className="sb-title text-3xl">Connect your tools</div>
      <p className="mt-3 text-sm text-[color:var(--sb-muted)] leading-relaxed">
        Starbeam generates better pulses when it has real context. You can connect one source now and skip the rest.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link href={`${base}/integrations`} className="sb-card-inset p-5">
          <div className="sb-title text-base font-extrabold">Google</div>
          <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
            {googleConnections ? "Connected" : "Not connected"}
          </div>
          <div className="mt-4 inline-flex sb-btn sb-btn-primary px-4 py-2 text-xs font-extrabold">
            {googleConnections ? "Manage" : "Connect"}
          </div>
        </Link>
        <Link href={`${base}/integrations`} className="sb-card-inset p-5">
          <div className="sb-title text-base font-extrabold">GitHub</div>
          <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
            {githubConnections ? "Connected" : "Not connected"}
          </div>
          <div className="mt-4 inline-flex sb-btn px-4 py-2 text-xs font-semibold">
            {githubConnections ? "Manage" : "Connect"}
          </div>
        </Link>
        <Link href={`${base}/integrations`} className="sb-card-inset p-5">
          <div className="sb-title text-base font-extrabold">Linear</div>
          <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
            {linearConnections ? "Connected" : "Not connected"}
          </div>
          <div className="mt-4 inline-flex sb-btn px-4 py-2 text-xs font-semibold">
            {linearConnections ? "Manage" : "Connect"}
          </div>
        </Link>
        <Link href={`${base}/integrations`} className="sb-card-inset p-5">
          <div className="sb-title text-base font-extrabold">Notion</div>
          <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
            {notionConnections ? "Connected" : "Not connected"}
          </div>
          <div className="mt-4 inline-flex sb-btn px-4 py-2 text-xs font-semibold">
            {notionConnections ? "Manage" : "Connect"}
          </div>
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-[color:var(--sb-muted)]">
          Minimum: connect at least one tool.
        </div>
        <Link
          href={`${base}/onboarding?step=${encodeURIComponent(nextStep(step))}`}
          className="sb-btn sb-btn-primary px-5 py-2.5 text-xs font-extrabold"
        >
          Continue
        </Link>
      </div>
    </>
  );

  const downloadStep = (
    <>
      <div className="sb-title text-3xl">Install the macOS app</div>
      <p className="mt-3 text-sm text-[color:var(--sb-muted)] leading-relaxed">
        Starbeam delivers pulses in your menu bar. Download the app, sign in, and keep it running.
      </p>

      <div className="mt-6 sb-card-inset p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="sb-title text-base font-extrabold">macOS app</div>
            <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
              Status:{" "}
              <span className="font-semibold text-[color:var(--sb-fg)]">
                {hasMacApp ? "signed in" : "not signed in yet"}
              </span>
            </div>
          </div>
          <Link
            href={`${siteOrigin()}/download`}
            className="sb-btn sb-btn-primary inline-flex px-4 py-2 text-xs font-extrabold"
          >
            Download
          </Link>
        </div>
        <div className="mt-3 text-xs text-[color:var(--sb-muted)] leading-relaxed">
          Once you finish sign-in on macOS, this step will flip to “signed in”.
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-[color:var(--sb-muted)]">
          You can continue even if you install later.
        </div>
        <Link
          href={`${base}/onboarding?step=${encodeURIComponent(nextStep(step))}`}
          className="sb-btn sb-btn-primary px-5 py-2.5 text-xs font-extrabold"
        >
          Continue
        </Link>
      </div>
    </>
  );

  const contextStep = (
    <>
      <div className="sb-title text-3xl">Add a bit of context</div>
      <p className="mt-3 text-sm text-[color:var(--sb-muted)] leading-relaxed">
        Optional, but it improves quality fast: set a company profile and 1–3 goals so research is focused.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link href={`${base}/profile`} className="sb-card-inset p-5">
          <div className="sb-title text-base font-extrabold">Profile</div>
          <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
            {hasProfile ? "Added" : "Not set yet"}
          </div>
          <div className="mt-4 inline-flex sb-btn px-4 py-2 text-xs font-semibold">
            Open
          </div>
        </Link>
        <Link href={`${base}/tracks`} className="sb-card-inset p-5">
          <div className="sb-title text-base font-extrabold">Goals</div>
          <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
            {hasGoals ? `${activeGoals} active` : "None yet"}
          </div>
          <div className="mt-4 inline-flex sb-btn px-4 py-2 text-xs font-semibold">
            Open
          </div>
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-[color:var(--sb-muted)]">
          Safe to skip: Starbeam can bootstrap a starter profile/goals on first run.
        </div>
        <Link
          href={`${base}/onboarding?step=${encodeURIComponent(nextStep(step))}`}
          className="sb-btn sb-btn-primary px-5 py-2.5 text-xs font-extrabold"
        >
          Continue
        </Link>
      </div>
    </>
  );

  const generateStep = (
    <>
      <div className="sb-title text-3xl">Generate your first pulse</div>
      <p className="mt-3 text-sm text-[color:var(--sb-muted)] leading-relaxed">
        If this is your first setup, Starbeam queues a bootstrap sync and then runs the first pulse about 10 minutes after
        your first tool connection.
      </p>

      <div className="mt-6 grid gap-3">
        <div className="sb-card-inset p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="sb-title text-base font-extrabold">Bootstrap</div>
              <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                Status:{" "}
                <span className="font-semibold text-[color:var(--sb-fg)]">
                  {statusLabel(bootstrapRun?.status)}
                </span>
              </div>
              {bootstrapRun?.errorSummary ? (
                <div className="mt-2 text-xs text-[color:var(--sb-muted)]">
                  Error: {bootstrapRun.errorSummary}
                </div>
              ) : null}
            </div>
            <Link href={`${base}/jobs`} className="sb-btn px-4 py-2 text-xs font-semibold">
              View runs
            </Link>
          </div>
        </div>

        <div className="sb-card-inset p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="sb-title text-base font-extrabold">First pulse run</div>
              <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                Status:{" "}
                <span className="font-semibold text-[color:var(--sb-fg)]">
                  {statusLabel(autoFirstRun?.status)}
                </span>
              </div>
              {autoFirstRun?.errorSummary ? (
                <div className="mt-2 text-xs text-[color:var(--sb-muted)]">
                  Error: {autoFirstRun.errorSummary}
                </div>
              ) : null}
            </div>
            <form action={runNightlyNow.bind(null, membership.workspace.slug)}>
              <button
                type="submit"
                className="sb-btn sb-btn-primary px-4 py-2 text-xs font-extrabold"
                disabled={!manageable}
                title={!manageable ? "Managers/Admins only" : undefined}
              >
                Generate now
              </button>
            </form>
          </div>

          {!manageable ? (
            <div className="mt-3 text-xs text-[color:var(--sb-muted)]">
              Only managers/admins can trigger runs in v0. If a manager connected the first tool, this will run automatically.
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={`${base}/jobs`} className="sb-btn px-4 py-2 text-xs font-semibold">
          Refresh status
        </Link>
        <Link href={`${base}/pulse`} className="sb-btn sb-btn-primary px-5 py-2.5 text-xs font-extrabold">
          Go to Pulse
        </Link>
      </div>
    </>
  );

  const body =
    step === "tools"
      ? toolsStep
      : step === "download"
        ? downloadStep
        : step === "context"
          ? contextStep
          : generateStep;

  return (
    <div className="sb-bg min-h-[100svh]">
      <div className="mx-auto max-w-3xl px-6 py-12">
        {chrome}

        <div className="mt-6 sb-card p-8">
          {body}
          {nav}
        </div>

        <div className="mt-5 text-xs text-[color:var(--sb-muted)]">
          Tip: you can always revisit this flow via{" "}
          <Link href={`${base}/onboarding`} className="underline underline-offset-2">
            Setup
          </Link>
          .
        </div>
      </div>
    </div>
  );
}
