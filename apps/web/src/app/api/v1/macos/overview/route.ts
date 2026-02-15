import { prisma } from "@starbeam/db";
import {
  lastActiveUpdateCutoff,
  shouldUpdateLastActiveAt,
} from "@starbeam/shared";
import { NextResponse } from "next/server";

import { parseAccessToken, sha256Hex } from "@/lib/apiTokens";
import {
  buildOnboardingPayload,
  inferPulseLane,
  pulseSourceLabel,
} from "@/lib/macosOverviewPresentation";
import { deriveFirstPulseActivation } from "@/lib/activationState";
import { isMacosActivationHintsEnabled } from "@/lib/flags";
import { recordUsageEventSafe } from "@/lib/usageEvents";

type Citation = { url: string; title?: string };
type JobRunSummary = {
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "PARTIAL" | null;
  errorSummary: string | null;
  createdAt: Date;
  startedAt: Date | null;
} | null;

type PersonaTrack =
  | "SOLO_FOUNDER"
  | "SMALL_TEAM_5_10"
  | "GROWTH_TEAM_11_50"
  | "UNKNOWN";

type PersonaSubmode =
  | "SHIP_HEAVY"
  | "GTM_HEAVY"
  | "ALIGNMENT_GAP"
  | "EXECUTION_DRIFT"
  | "UNKNOWN";

function iconForCardKind(kind: string): string | undefined {
  if (kind === "ANNOUNCEMENT") return "🔔";
  if (kind === "GOAL") return "⭐️";
  if (kind === "WEB_RESEARCH") return "🚀";
  return "💡";
}

function extractCitations(sources: unknown): Citation[] {
  if (!sources || typeof sources !== "object") return [];
  const obj = sources as Record<string, unknown>;
  const citations = obj.citations;
  if (!Array.isArray(citations)) return [];
  return citations
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const cc = c as Record<string, unknown>;
      const url = typeof cc.url === "string" ? cc.url : "";
      const title = typeof cc.title === "string" ? cc.title : undefined;
      if (!url) return null;
      return { url, ...(title ? { title } : {}) } satisfies Citation;
    })
    .filter((c): c is Citation => c !== null);
}

function iconForFocusSource(
  type: string | null | undefined,
): string | undefined {
  if (type === "GMAIL_MESSAGE") return "sf:envelope";
  if (type === "CALENDAR_EVENT") return "sf:calendar";
  if (type === "MANUAL") return "sf:checkmark.circle";
  return "sf:checkmark.circle";
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function hasGoogleAuthEnv(): boolean {
  return Boolean(
    (process.env.GOOGLE_CLIENT_ID ?? "").trim() &&
    (process.env.GOOGLE_CLIENT_SECRET ?? "").trim(),
  );
}

function ageMinsFrom(date: Date | null | undefined, now: Date): number | null {
  if (!date) return null;
  const ms = now.getTime() - date.getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / 60_000);
}

async function userIdFromRefreshToken(
  request: Request,
): Promise<string | null> {
  const refreshToken = (
    request.headers.get("x-starbeam-refresh-token") ?? ""
  ).trim();
  if (!refreshToken) return null;

  const tokenHash = sha256Hex(refreshToken);
  const now = new Date();

  const existing = await prisma.apiRefreshToken.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
    select: { userId: true },
  });

  return existing?.userId ?? null;
}

function formatRelativePast(then: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - then.getTime());
  const min = Math.floor(ms / (60 * 1000));
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function formatRelativeUntil(then: Date, now: Date): string {
  const ms = then.getTime() - now.getTime();
  const min = Math.round(ms / (60 * 1000));
  if (min <= 0) return "Started";
  if (min < 60) return `In ${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `In ${hr}h`;
  const day = Math.round(hr / 24);
  return `In ${day}d`;
}

function inferPersonaTrack(args: {
  memberCount: number;
  integrationCount: number;
  openTaskCount: number;
}): PersonaTrack {
  if (args.memberCount >= 11 && args.memberCount <= 50) {
    return "GROWTH_TEAM_11_50";
  }
  if (args.memberCount >= 5 && args.memberCount <= 10) {
    return "SMALL_TEAM_5_10";
  }
  if (args.memberCount >= 1 && args.memberCount <= 4) {
    return "SOLO_FOUNDER";
  }
  if (args.integrationCount >= 3 && args.openTaskCount >= 3) {
    return "SMALL_TEAM_5_10";
  }
  if (args.openTaskCount > 0) {
    return "SOLO_FOUNDER";
  }
  return "UNKNOWN";
}

function recommendedFocusForPersona(persona: PersonaTrack): string {
  if (persona === "SOLO_FOUNDER") {
    return "Keep shipping, but commit one distribution or customer-research action today.";
  }
  if (persona === "SMALL_TEAM_5_10") {
    return "Align owners for this week and remove one blocker that affects multiple teammates.";
  }
  if (persona === "GROWTH_TEAM_11_50") {
    return "Improve execution quality by clarifying ownership, dependencies, and measurable outcomes.";
  }
  return "Choose one highest-leverage outcome and define the next concrete action.";
}

function inferPersonaSubmode(args: {
  personaTrack: PersonaTrack;
  memberCount: number;
  integrationCount: number;
  openTaskCount: number;
}): PersonaSubmode {
  if (
    (args.personaTrack === "SMALL_TEAM_5_10" ||
      args.personaTrack === "GROWTH_TEAM_11_50") &&
    args.memberCount >= 5 &&
    (args.integrationCount <= 1 || args.openTaskCount >= 8)
  ) {
    return "ALIGNMENT_GAP";
  }
  if (args.openTaskCount >= 5 && args.integrationCount <= 1) {
    return "SHIP_HEAVY";
  }
  if (args.integrationCount >= 2 && args.openTaskCount <= 3) {
    return "GTM_HEAVY";
  }
  if (args.openTaskCount >= 6) {
    return "EXECUTION_DRIFT";
  }
  return "UNKNOWN";
}

function whyThisTodayForPersonaSubmode(args: {
  personaTrack: PersonaTrack;
  personaSubmode: PersonaSubmode;
}): string {
  if (args.personaSubmode === "SHIP_HEAVY") {
    return "You are shipping quickly; add one concrete distribution action to convert output into outcomes.";
  }
  if (args.personaSubmode === "GTM_HEAVY") {
    return "Your context is GTM-heavy today; choose a measurable experiment and close the loop by end of day.";
  }
  if (args.personaSubmode === "ALIGNMENT_GAP") {
    return "Signals indicate alignment risk; clarify ownership and dependencies before adding new work.";
  }
  if (args.personaSubmode === "EXECUTION_DRIFT") {
    return "Execution may be drifting; pick one highest-leverage action and finish it fully.";
  }
  return recommendedFocusForPersona(args.personaTrack);
}

export async function GET(request: Request) {
  const token = getBearerToken(request);
  let userId: string | null = null;
  if (token) {
    try {
      const payload = parseAccessToken(token);
      userId = payload.sub;
    } catch {
      userId = await userIdFromRefreshToken(request);
    }
  } else {
    userId = await userIdFromRefreshToken(request);
  }

  if (!userId) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const access = await prisma.user.findUnique({
    where: { id: userId },
    select: { betaAccessGrantedAt: true },
  });
  if (!access?.betaAccessGrantedAt) {
    return NextResponse.json(
      { error: "access_denied" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(request.url);
  const requestedWorkspaceId = url.searchParams.get("workspace_id") ?? "";
  if (!requestedWorkspaceId) {
    return NextResponse.json(
      { error: "invalid_request", errorDescription: "Missing workspace_id" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  let membership = await prisma.membership.findFirst({
    where: { workspaceId: requestedWorkspaceId, userId },
    include: { workspace: true },
  });
  if (!membership) {
    // Backwards-compatible recovery: older/stale macOS clients can end up with an
    // invalid workspace id persisted in settings. If the user only has one workspace,
    // default to it rather than hard-failing.
    const memberships = await prisma.membership.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
      take: 2,
    });

    const only = memberships[0] ?? null;
    if (memberships.length === 1 && only) {
      membership = only;
    } else {
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  if (!membership) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const workspaceId = membership.workspaceId;
  const hintsEnabled = isMacosActivationHintsEnabled();

  const now = new Date();
  const throttleMins = parseIntEnv("STARB_ACTIVE_UPDATE_THROTTLE_MINS", 60);
  const touchMembership = shouldUpdateLastActiveAt({
    lastActiveAt: membership.lastActiveAt,
    now,
    throttleMins,
  })
    ? prisma.membership
        .updateMany({
          where: {
            id: membership.id,
            OR: [
              { lastActiveAt: null },
              {
                lastActiveAt: { lt: lastActiveUpdateCutoff(now, throttleMins) },
              },
            ],
          },
          data: { lastActiveAt: now },
        })
        .catch(() => undefined)
    : Promise.resolve();

  const edition = await prisma.pulseEdition.findFirst({
    where: { workspaceId, userId },
    orderBy: { editionDate: "desc" },
    include: {
      cards: {
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        take: 12,
      },
    },
  });

  const [
    personalProfile,
    workspaceMemberCount,
    activePersonalGoalCount,
    googleConnectedCount,
    githubConnectedCount,
    linearConnectedCount,
    notionConnectedCount,
    tasks,
    completedTasks,
    events,
    bootstrapJobRun,
    autoFirstJobRun,
  ] = await Promise.all([
    prisma.workspaceMemberProfile.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { jobTitle: true, about: true },
    }),
    prisma.membership.count({ where: { workspaceId } }),
    prisma.personalGoal.count({
      where: { workspaceId, userId, active: true },
    }),
    prisma.googleConnection.count({
      where: { workspaceId, ownerUserId: userId, status: "CONNECTED" },
    }),
    prisma.gitHubConnection.count({
      where: { workspaceId, ownerUserId: userId, status: "CONNECTED" },
    }),
    prisma.linearConnection.count({
      where: { workspaceId, ownerUserId: userId, status: "CONNECTED" },
    }),
    prisma.notionConnection.count({
      where: { workspaceId, ownerUserId: userId, status: "CONNECTED" },
    }),
    prisma.task.findMany({
      where: {
        workspaceId,
        userId,
        status: "OPEN",
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
      },
      include: { sourceItem: true },
      orderBy: [{ createdAt: "desc" }],
      take: 60,
    }),
    prisma.task.findMany({
      where: {
        workspaceId,
        userId,
        status: "DONE",
        updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      include: { sourceItem: true },
      orderBy: [{ updatedAt: "desc" }],
      take: 60,
    }),
    prisma.sourceItem.findMany({
      where: {
        workspaceId,
        ownerUserId: userId,
        type: "CALENDAR_EVENT",
        occurredAt: {
          gte: now,
          lt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { occurredAt: "asc" },
      take: 10,
    }),
    hintsEnabled
      ? prisma.jobRun.findUnique({
          where: { id: `bootstrap:${workspaceId}:${userId}` },
          select: {
            status: true,
            errorSummary: true,
            createdAt: true,
            startedAt: true,
          },
        })
      : Promise.resolve(null),
    hintsEnabled
      ? prisma.jobRun.findUnique({
          where: { id: `auto-first:${workspaceId}:${userId}` },
          select: {
            status: true,
            errorSummary: true,
            createdAt: true,
            startedAt: true,
          },
        })
      : Promise.resolve(null),
  ]);
  await touchMembership;

  const hasPersonalProfile = Boolean(
    personalProfile &&
    ((personalProfile.jobTitle ?? "").trim().length > 0 ||
      (personalProfile.about ?? "").trim().length > 0),
  );

  const onboarding = buildOnboardingPayload({
    workspaceSlug: membership.workspace.slug,
    hasPersonalProfile,
    hasPersonalGoal: activePersonalGoalCount > 0,
    hasIntegration:
      googleConnectedCount +
        githubConnectedCount +
        linearConnectedCount +
        notionConnectedCount >
      0,
  });
  const integrationCount =
    googleConnectedCount +
    githubConnectedCount +
    linearConnectedCount +
    notionConnectedCount;
  const personaTrack = inferPersonaTrack({
    memberCount: workspaceMemberCount,
    integrationCount,
    openTaskCount: tasks.length,
  });
  const personaSubmode = inferPersonaSubmode({
    personaTrack,
    memberCount: workspaceMemberCount,
    integrationCount,
    openTaskCount: tasks.length,
  });
  const pulseMeta = hintsEnabled
    ? {
        personaTrack,
        personaSubmode,
        recommendedFocus: recommendedFocusForPersona(personaTrack),
        whyThisToday: whyThisTodayForPersonaSubmode({
          personaTrack,
          personaSubmode,
        }),
      }
    : null;

  const hiddenPulseCardIdSet = new Set<string>();
  if (edition?.cards.length) {
    const hiddenRows = await prisma.insightActionState.findMany({
      where: {
        workspaceId,
        userId,
        editionDate: edition.editionDate,
        cardId: { in: edition.cards.map((card) => card.id) },
        state: { in: ["DONE", "DISMISSED"] },
      },
      select: { cardId: true },
    });
    for (const row of hiddenRows) hiddenPulseCardIdSet.add(row.cardId);
  }

  const pulseCandidates = (edition?.cards ?? []).map((c) => {
    const sources = extractCitations(c.sources);
    const lane = inferPulseLane({
      onboardingMode: onboarding.mode,
      onboardingChecklist: onboarding.checklist,
      kind: c.kind,
      title: c.title,
      body: c.body,
      action: c.action,
    });

    return {
      id: c.id,
      kind: c.kind,
      lane,
      priority: c.priority,
      icon: iconForCardKind(c.kind),
      title: c.title,
      body: c.body || c.action || c.why || "",
      why: c.why || null,
      action: c.action || null,
      sources,
      sourceLabel: pulseSourceLabel({
        lane,
        kind: c.kind,
        title: c.title,
        citations: sources,
      }),
      occurredAt: c.createdAt.toISOString(),
    };
  });
  const pulseWithoutOnboardingDupes =
    onboarding.mode === "SETUP"
      ? pulseCandidates.filter((card) => card.lane !== "ONBOARDING")
      : pulseCandidates;
  const pulse = pulseWithoutOnboardingDupes
    .filter((card) => !hiddenPulseCardIdSet.has(card.id))
    .slice(0, 7);

  let activationHints: {
    state: string;
    nextAction: string;
    reason: string;
  } | null = null;
  if (hintsEnabled) {
    const [bootstrapCompat, autoFirstCompat] = await Promise.all([
      bootstrapJobRun
        ? Promise.resolve(null)
        : prisma.jobRun.findUnique({
            where: { id: `bootstrap:${workspaceId}` },
            select: {
              status: true,
              errorSummary: true,
              createdAt: true,
              startedAt: true,
            },
          }),
      autoFirstJobRun
        ? Promise.resolve(null)
        : prisma.jobRun.findUnique({
            where: { id: `auto-first:${workspaceId}` },
            select: {
              status: true,
              errorSummary: true,
              createdAt: true,
              startedAt: true,
            },
          }),
    ]);

    const bootstrapRun: JobRunSummary = bootstrapJobRun ?? bootstrapCompat;
    const autoFirstRun: JobRunSummary = autoFirstJobRun ?? autoFirstCompat;
    const staleThresholdMins = Math.max(
      5,
      parseIntEnv("STARB_FIRST_PULSE_STALE_MINS", 20),
    );
    const activation = deriveFirstPulseActivation({
      hasAnyPulse: pulse.length > 0,
      hasGoogleConnection:
        googleConnectedCount +
          githubConnectedCount +
          linearConnectedCount +
          notionConnectedCount >
        0,
      googleAuthConfigured: hasGoogleAuthEnv(),
      queuedFromQueryParam: false,
      bootstrapStatus: bootstrapRun?.status ?? null,
      autoFirstStatus: autoFirstRun?.status ?? null,
      bootstrapErrorSummary: bootstrapRun?.errorSummary,
      autoFirstErrorSummary: autoFirstRun?.errorSummary,
      bootstrapQueuedAgeMins:
        bootstrapRun?.status === "QUEUED"
          ? ageMinsFrom(bootstrapRun.createdAt, now)
          : null,
      bootstrapRunningAgeMins:
        bootstrapRun?.status === "RUNNING"
          ? ageMinsFrom(bootstrapRun.startedAt ?? bootstrapRun.createdAt, now)
          : null,
      autoFirstQueuedAgeMins:
        autoFirstRun?.status === "QUEUED"
          ? ageMinsFrom(autoFirstRun.createdAt, now)
          : null,
      autoFirstRunningAgeMins:
        autoFirstRun?.status === "RUNNING"
          ? ageMinsFrom(autoFirstRun.startedAt ?? autoFirstRun.createdAt, now)
          : null,
      staleThresholdMins,
    });

    activationHints = {
      state: activation.state,
      nextAction: activation.primaryAction,
      reason: activation.errorDetail ?? activation.description,
    };
  }

  const focusItem = (t: (typeof tasks)[number]) => {
    const srcType =
      t.sourceItem?.type ?? (t.sourceItemId ? null : ("MANUAL" as const));
    const subtitle =
      srcType === "GMAIL_MESSAGE" && t.sourceItem
        ? `From Gmail · ${formatRelativePast(t.sourceItem.occurredAt, now)}`
        : srcType === "CALENDAR_EVENT" && t.sourceItem
          ? `Calendar · ${formatRelativeUntil(t.sourceItem.occurredAt, now)}`
          : "";

    return {
      id: t.id,
      icon: iconForFocusSource(srcType),
      title: t.title,
      subtitle: subtitle || null,
    };
  };

  const sortedOpen = tasks.slice().sort((a, b) => {
    const ad = a.dueAt ? a.dueAt.getTime() : Number.POSITIVE_INFINITY;
    const bd = b.dueAt ? b.dueAt.getTime() : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const manual = sortedOpen.filter((t) => !t.sourceItemId);
  const derived = sortedOpen.filter((t) => Boolean(t.sourceItemId));

  const focus = [...manual, ...derived].map(focusItem);

  const completedFocus = completedTasks.map((t) => ({
    id: t.id,
    icon: "sf:checkmark.circle.fill",
    title: t.title,
    subtitle: "Completed",
  }));

  const calendar = events.slice(0, 5).map((e) => ({
    id: e.id,
    start: e.occurredAt,
    end: e.endsAt,
    title: e.title,
  }));

  const overviewSyncThrottleMins = parseIntEnv(
    "STARB_OVERVIEW_SYNC_EVENT_THROTTLE_MINS",
    15,
  );
  const overviewSyncCutoff = new Date(
    now.getTime() - overviewSyncThrottleMins * 60 * 1000,
  );
  const recentOverviewSync = await prisma.usageEvent.findFirst({
    where: {
      workspaceId,
      userId,
      eventType: "OVERVIEW_SYNCED_MACOS",
      createdAt: { gte: overviewSyncCutoff },
    },
    select: { id: true },
  });
  if (!recentOverviewSync) {
    await recordUsageEventSafe({
      eventType: "OVERVIEW_SYNCED_MACOS",
      source: "macos",
      workspaceId,
      userId,
      metadata: {
        pulseCardCount: pulse.length,
        focusItemCount: focus.length,
        onboardingMode: onboarding.mode,
      },
    });
  }

  return NextResponse.json(
    {
      workspace: {
        id: membership.workspace.id,
        name: membership.workspace.name,
        slug: membership.workspace.slug,
      },
      bumpMessage: null,
      onboarding,
      pulse,
      focus,
      completedFocus,
      calendar,
      editionDate: edition?.editionDate ?? null,
      generatedAt: now,
      ...(activationHints ? { activationHints } : {}),
      ...(pulseMeta ? { pulseMeta } : {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
