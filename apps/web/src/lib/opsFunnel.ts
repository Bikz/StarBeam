import { prisma } from "@starbeam/db";

import { isOpsManualSkillControlEnabled } from "@/lib/flags";
import {
  defaultInsightManualControls,
  loadInsightManualControls,
  parseDisabledSkillRefsInput,
} from "@/lib/insightManualControls";
import { usageEventTypes } from "@/lib/usageEvents";

export type FunnelWindowDays = 7 | 28;
export type DesignPartnerStatusFilter =
  | "ALL"
  | "PROSPECT"
  | "ACTIVE"
  | "CHURNED";

export type UsageEventRow = {
  eventType: (typeof usageEventTypes)[number];
  userId: string | null;
  workspaceId: string | null;
  createdAt: Date;
};

export type ActivationSummary = {
  signedIn: number;
  googleConnected: number;
  firstPulseQueued: number;
  firstPulseReady: number;
  readyWithin24h: number;
  readyWithin7d: number;
};

export type RetentionSummary = {
  pulseViewedWeek1_1plus: number;
  pulseViewedWeek1_3plus: number;
  overviewSyncedWeek1_1plus: number;
};

export type ActivationBacklogSummary = {
  connectedNoPulse24h: number;
  failedBlocking24h: number;
  failedRetriable24h: number;
  queuedOrRunningStale24h: number;
  topFailureReasons: Array<{ reason: string; count: number }>;
};

export type WorkspaceFunnelSummary = {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  programStatus: "NONE" | "PROSPECT" | "ACTIVE" | "CHURNED";
  programStartedAt: string | null;
  programEndedAt: string | null;
  googleConnectedUsers: number;
  firstPulseReadyUsers: number;
  weeklyActiveUsers: number;
};

export type InsightQualityRates = {
  helpfulRatePct: number;
  notHelpfulRatePct: number;
  actionCompletionRatePct: number;
};

export type OpsFunnelSummary = {
  generatedAt: string;
  windowDays: FunnelWindowDays;
  activation: ActivationSummary;
  chainCoveragePct: number;
  insightQuality: {
    helpfulRatePct7d: number;
    notHelpfulRatePct7d: number;
    actionCompletionRatePct7d: number;
  };
  activationBacklog: ActivationBacklogSummary;
  retention: RetentionSummary;
  designPartners: {
    prospectCount: number;
    activeCount: number;
    churnedCount: number;
  };
  byWorkspace: WorkspaceFunnelSummary[];
  feedback: {
    topCategories7d: Array<{ category: string; count: number }>;
  };
};

export type OpsInsightsSummary = {
  generatedAt: string;
  windowDays: FunnelWindowDays;
  quality: InsightQualityRates;
  byPersona: Array<{
    personaTrack: string;
    deliveryCount: number;
    helpfulRatePct: number;
    notHelpfulRatePct: number;
    actionCompletionRatePct: number;
  }>;
  bySkill: Array<{
    skillRef: string;
    deliveryCount: number;
    helpfulRatePct: number;
    notHelpfulRatePct: number;
    actionCompletionRatePct: number;
  }>;
  bySubmode: Array<{
    personaSubmode: string;
    deliveryCount: number;
    helpfulRatePct: number;
    notHelpfulRatePct: number;
    actionCompletionRatePct: number;
  }>;
  discoveredSkillRunner: {
    executedCount: number;
    skippedByEvaluatorCount: number;
    helpfulLiftPct: number;
    actionLiftPct: number;
  };
  manualControls: {
    discoveredSkillExecutionEnabled: boolean;
    disabledSkillRefs: string[];
  };
  runner: {
    p95DurationSec: number;
    retryRatePct: number;
    fallbackRatePct: number;
    avgInputTokens: number;
    avgOutputTokens: number;
  };
};

function eventPairKey(event: {
  userId: string | null;
  workspaceId: string | null;
}): string | null {
  if (!event.userId || !event.workspaceId) return null;
  return `${event.userId}:${event.workspaceId}`;
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function toRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return round1((numerator / denominator) * 100);
}

export function computeInsightQualityRates(args: {
  helpful: number;
  notHelpful: number;
  viewed: number;
  markedDone: number;
}): InsightQualityRates {
  const feedbackTotal = args.helpful + args.notHelpful;
  return {
    helpfulRatePct: toRate(args.helpful, feedbackTotal),
    notHelpfulRatePct: toRate(args.notHelpful, feedbackTotal),
    actionCompletionRatePct: toRate(args.markedDone, args.viewed),
  };
}

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const rank = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1),
  );
  return sorted[rank] ?? 0;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function codexTokenAverages(jobRuns: Array<{ meta: unknown }>): {
  avgInputTokens: number;
  avgOutputTokens: number;
} {
  let runsWithInputTokens = 0;
  let runsWithOutputTokens = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const run of jobRuns) {
    const meta = asObject(run.meta);
    const codex = asObject(meta?.codex);
    const estimates = asObject(codex?.estimates);
    const inputTokens = readNumber(estimates?.inputTokens);
    const outputTokens = readNumber(estimates?.outputTokens);
    if (typeof inputTokens === "number") {
      totalInputTokens += inputTokens;
      runsWithInputTokens += 1;
    }
    if (typeof outputTokens === "number") {
      totalOutputTokens += outputTokens;
      runsWithOutputTokens += 1;
    }
  }

  return {
    avgInputTokens:
      runsWithInputTokens > 0
        ? Math.round(totalInputTokens / runsWithInputTokens)
        : 0,
    avgOutputTokens:
      runsWithOutputTokens > 0
        ? Math.round(totalOutputTokens / runsWithOutputTokens)
        : 0,
  };
}

export function computeChainCoveragePct(events: UsageEventRow[]): number {
  const signedInUsers = uniqueUsersByType(events, "SIGNED_IN");
  if (signedInUsers.size === 0) return 100;

  const googleUsers = uniqueUsersByType(events, "GOOGLE_CONNECTED");
  const queuedUsers = uniqueUsersByType(events, "FIRST_PULSE_QUEUED");
  const readyUsers = uniqueUsersByType(events, "FIRST_PULSE_READY");

  let complete = 0;
  for (const userId of signedInUsers) {
    if (
      googleUsers.has(userId) &&
      queuedUsers.has(userId) &&
      readyUsers.has(userId)
    ) {
      complete += 1;
    }
  }

  return round1((complete / signedInUsers.size) * 100);
}

function classifyActivationFailure(
  errorSummary: string | null | undefined,
): "blocking" | "retriable" {
  const summary = (errorSummary ?? "").trim();
  if (!summary) return "retriable";

  if (
    /missing google_client_id/i.test(summary) ||
    /missing google_client_secret/i.test(summary) ||
    /google oauth/i.test(summary) ||
    /misconfigured/i.test(summary) ||
    /workspace not found/i.test(summary) ||
    /target user is not a workspace member/i.test(summary)
  ) {
    return "blocking";
  }

  return "retriable";
}

function summarizeFailureReason(
  errorSummary: string | null | undefined,
): string {
  const summary = (errorSummary ?? "").trim();
  if (!summary) return "unknown";
  const firstLine = summary.split("\n")[0]?.trim() ?? "";
  return (firstLine || "unknown").slice(0, 180);
}

function firstEventByUser(
  events: UsageEventRow[],
  eventType: UsageEventRow["eventType"],
): Map<string, Date> {
  const map = new Map<string, Date>();
  for (const event of events) {
    if (event.eventType !== eventType) continue;
    if (!event.userId) continue;
    const current = map.get(event.userId);
    if (!current || event.createdAt.getTime() < current.getTime()) {
      map.set(event.userId, event.createdAt);
    }
  }
  return map;
}

function uniqueUsersByType(
  events: UsageEventRow[],
  eventType: UsageEventRow["eventType"],
): Set<string> {
  const set = new Set<string>();
  for (const event of events) {
    if (event.eventType !== eventType) continue;
    if (!event.userId) continue;
    set.add(event.userId);
  }
  return set;
}

function countEventsInWindow(args: {
  events: UsageEventRow[];
  userId: string;
  type: UsageEventRow["eventType"];
  startAt: Date;
  endAt: Date;
}): number {
  return args.events.filter((event) => {
    return (
      event.userId === args.userId &&
      event.eventType === args.type &&
      event.createdAt.getTime() >= args.startAt.getTime() &&
      event.createdAt.getTime() <= args.endAt.getTime()
    );
  }).length;
}

export function computeFunnelFromEvents(events: UsageEventRow[]): {
  activation: ActivationSummary;
  retention: RetentionSummary;
} {
  const ordered = events.slice().sort((a, b) => {
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const firstSignedIn = firstEventByUser(ordered, "SIGNED_IN");
  const firstReady = firstEventByUser(ordered, "FIRST_PULSE_READY");

  let readyWithin24h = 0;
  let readyWithin7d = 0;

  for (const [userId, signedInAt] of firstSignedIn) {
    const readyAt = firstReady.get(userId);
    if (!readyAt) continue;

    const diffMs = readyAt.getTime() - signedInAt.getTime();
    if (diffMs < 0) continue;
    if (diffMs <= 24 * 60 * 60 * 1000) readyWithin24h += 1;
    if (diffMs <= 7 * 24 * 60 * 60 * 1000) readyWithin7d += 1;
  }

  let pulseViewedWeek1_1plus = 0;
  let pulseViewedWeek1_3plus = 0;
  let overviewSyncedWeek1_1plus = 0;

  for (const [userId, readyAt] of firstReady) {
    const weekEnd = new Date(readyAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    const pulseViews = countEventsInWindow({
      events: ordered,
      userId,
      type: "PULSE_VIEWED_WEB",
      startAt: readyAt,
      endAt: weekEnd,
    });
    const overviewSyncs = countEventsInWindow({
      events: ordered,
      userId,
      type: "OVERVIEW_SYNCED_MACOS",
      startAt: readyAt,
      endAt: weekEnd,
    });

    if (pulseViews >= 1) pulseViewedWeek1_1plus += 1;
    if (pulseViews >= 3) pulseViewedWeek1_3plus += 1;
    if (overviewSyncs >= 1) overviewSyncedWeek1_1plus += 1;
  }

  return {
    activation: {
      signedIn: firstSignedIn.size,
      googleConnected: uniqueUsersByType(ordered, "GOOGLE_CONNECTED").size,
      firstPulseQueued: uniqueUsersByType(ordered, "FIRST_PULSE_QUEUED").size,
      firstPulseReady: firstReady.size,
      readyWithin24h,
      readyWithin7d,
    },
    retention: {
      pulseViewedWeek1_1plus,
      pulseViewedWeek1_3plus,
      overviewSyncedWeek1_1plus,
    },
  };
}

function uniqueUsersForWorkspaceByTypes(args: {
  events: UsageEventRow[];
  workspaceId: string;
  types: UsageEventRow["eventType"][];
}): number {
  const set = new Set<string>();
  const typeSet = new Set(args.types);
  for (const event of args.events) {
    if (event.workspaceId !== args.workspaceId) continue;
    if (!typeSet.has(event.eventType)) continue;
    if (!event.userId) continue;
    set.add(event.userId);
  }
  return set.size;
}

export function parseWindowDays(
  input: string | null | undefined,
): FunnelWindowDays {
  const value = Number((input ?? "").trim());
  if (value === 28) return 28;
  return 7;
}

export function parseProgramStatusFilter(
  input: string | null | undefined,
): DesignPartnerStatusFilter {
  const raw = (input ?? "").trim().toUpperCase();
  if (raw === "PROSPECT" || raw === "ACTIVE" || raw === "CHURNED") {
    return raw;
  }
  return "ALL";
}

export async function getOpsFunnelSummary(args: {
  windowDays: FunnelWindowDays;
  programStatusFilter?: DesignPartnerStatusFilter;
  now?: Date;
}): Promise<OpsFunnelSummary> {
  const now = args.now ?? new Date();
  const windowStart = new Date(
    now.getTime() - args.windowDays * 24 * 60 * 60 * 1000,
  );
  const feedbackWindowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const backlogWindowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const staleThresholdMins = Math.max(
    5,
    parseIntEnv("STARB_FIRST_PULSE_STALE_MINS", 20),
  );

  const programStatusFilter = args.programStatusFilter ?? "ALL";

  const [
    events,
    designPartnerCounts,
    designPartnerWorkspaces,
    triageRowsRaw,
    recentAutoFirstRuns,
    insightInteractionRows,
  ] = await Promise.all([
    prisma.usageEvent.findMany({
      where: {
        createdAt: { gte: windowStart, lte: now },
        eventType: {
          in: [
            "SIGNED_IN",
            "GOOGLE_CONNECTED",
            "FIRST_PULSE_QUEUED",
            "FIRST_PULSE_READY",
            "PULSE_VIEWED_WEB",
            "OVERVIEW_SYNCED_MACOS",
            "INVITE_ACCEPTED",
          ],
        },
      },
      select: {
        eventType: true,
        userId: true,
        workspaceId: true,
        createdAt: true,
      },
    }),
    prisma.workspace.groupBy({
      by: ["programStatus"],
      where: { programType: "DESIGN_PARTNER", programStatus: { not: "NONE" } },
      _count: { _all: true },
    }),
    prisma.workspace.findMany({
      where: {
        programType: "DESIGN_PARTNER",
        programStatus:
          programStatusFilter === "ALL"
            ? { in: ["PROSPECT", "ACTIVE", "CHURNED"] }
            : programStatusFilter,
      },
      orderBy: [{ programStatus: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        programStatus: true,
        programStartedAt: true,
        programEndedAt: true,
      },
    }),
    prisma.feedback.groupBy({
      by: ["category"],
      where: {
        category: { not: null },
        triagedAt: { gte: feedbackWindowStart, lte: now },
      },
      _count: { _all: true },
    }),
    prisma.jobRun.findMany({
      where: {
        kind: "NIGHTLY_WORKSPACE_RUN",
        id: { startsWith: "auto-first:" },
        OR: [
          {
            status: { in: ["FAILED", "PARTIAL"] },
            finishedAt: { gte: backlogWindowStart, lte: now },
          },
          {
            status: { in: ["QUEUED", "RUNNING"] },
            createdAt: { gte: backlogWindowStart, lte: now },
          },
        ],
      },
      select: {
        id: true,
        status: true,
        errorSummary: true,
        createdAt: true,
        startedAt: true,
        meta: true,
      },
    }),
    prisma.insightInteraction.groupBy({
      by: ["interactionType"],
      where: {
        createdAt: { gte: feedbackWindowStart, lte: now },
      },
      _count: { _all: true },
    }),
  ]);

  const typedEvents = events as UsageEventRow[];
  const triageRows = (
    triageRowsRaw as Array<{
      category: string | null;
      _count: { _all: number };
    }>
  ).sort((a, b) => b._count._all - a._count._all);
  const funnel = computeFunnelFromEvents(typedEvents);
  const chainCoverage = computeChainCoveragePct(typedEvents);
  const interactionCountByType = new Map<string, number>();
  for (const row of insightInteractionRows) {
    interactionCountByType.set(row.interactionType, row._count._all);
  }
  const insightQuality = computeInsightQualityRates({
    helpful: interactionCountByType.get("HELPFUL") ?? 0,
    notHelpful: interactionCountByType.get("NOT_HELPFUL") ?? 0,
    viewed: interactionCountByType.get("VIEWED") ?? 0,
    markedDone: interactionCountByType.get("MARKED_DONE") ?? 0,
  });

  const connectedPairs24h = new Set(
    typedEvents
      .filter(
        (event) =>
          event.eventType === "GOOGLE_CONNECTED" &&
          event.createdAt.getTime() >= backlogWindowStart.getTime(),
      )
      .map(eventPairKey)
      .filter((key): key is string => Boolean(key)),
  );
  const readyPairs = new Set(
    typedEvents
      .filter((event) => event.eventType === "FIRST_PULSE_READY")
      .map(eventPairKey)
      .filter((key): key is string => Boolean(key)),
  );
  let connectedNoPulse24h = 0;
  for (const key of connectedPairs24h) {
    if (!readyPairs.has(key)) connectedNoPulse24h += 1;
  }

  let failedBlocking24h = 0;
  let failedRetriable24h = 0;
  let queuedOrRunningStale24h = 0;
  const reasons = new Map<string, number>();

  for (const run of recentAutoFirstRuns) {
    if (run.status === "FAILED" || run.status === "PARTIAL") {
      const failureMeta =
        run.meta &&
        typeof run.meta === "object" &&
        "activationFailure" in run.meta &&
        (run.meta as { activationFailure?: unknown }).activationFailure &&
        typeof (run.meta as { activationFailure?: unknown })
          .activationFailure === "object"
          ? ((
              run.meta as {
                activationFailure: { class?: unknown; reason?: unknown };
              }
            ).activationFailure ?? {})
          : {};

      const failureClass =
        failureMeta.class === "blocking" || failureMeta.class === "retriable"
          ? failureMeta.class
          : classifyActivationFailure(run.errorSummary);
      const reason =
        typeof failureMeta.reason === "string" && failureMeta.reason.trim()
          ? failureMeta.reason.trim()
          : summarizeFailureReason(run.errorSummary);

      if (failureClass === "blocking") failedBlocking24h += 1;
      else failedRetriable24h += 1;
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }

    if (run.status === "QUEUED" || run.status === "RUNNING") {
      const since =
        run.status === "RUNNING"
          ? (run.startedAt ?? run.createdAt)
          : run.createdAt;
      const ageMins = Math.floor((now.getTime() - since.getTime()) / 60_000);
      if (ageMins >= staleThresholdMins) queuedOrRunningStale24h += 1;
    }
  }

  const topFailureReasons = Array.from(reasons.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const byWorkspace: WorkspaceFunnelSummary[] = designPartnerWorkspaces.map(
    (workspace) => ({
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      workspaceName: workspace.name,
      programStatus: workspace.programStatus,
      programStartedAt: workspace.programStartedAt?.toISOString() ?? null,
      programEndedAt: workspace.programEndedAt?.toISOString() ?? null,
      googleConnectedUsers: uniqueUsersForWorkspaceByTypes({
        events: typedEvents,
        workspaceId: workspace.id,
        types: ["GOOGLE_CONNECTED"],
      }),
      firstPulseReadyUsers: uniqueUsersForWorkspaceByTypes({
        events: typedEvents,
        workspaceId: workspace.id,
        types: ["FIRST_PULSE_READY"],
      }),
      weeklyActiveUsers: uniqueUsersForWorkspaceByTypes({
        events: typedEvents,
        workspaceId: workspace.id,
        types: ["PULSE_VIEWED_WEB", "OVERVIEW_SYNCED_MACOS"],
      }),
    }),
  );

  const countByStatus = new Map<string, number>();
  for (const row of designPartnerCounts) {
    countByStatus.set(row.programStatus, row._count._all);
  }

  return {
    generatedAt: now.toISOString(),
    windowDays: args.windowDays,
    activation: funnel.activation,
    chainCoveragePct: chainCoverage,
    insightQuality: {
      helpfulRatePct7d: insightQuality.helpfulRatePct,
      notHelpfulRatePct7d: insightQuality.notHelpfulRatePct,
      actionCompletionRatePct7d: insightQuality.actionCompletionRatePct,
    },
    activationBacklog: {
      connectedNoPulse24h,
      failedBlocking24h,
      failedRetriable24h,
      queuedOrRunningStale24h,
      topFailureReasons,
    },
    retention: funnel.retention,
    designPartners: {
      prospectCount: countByStatus.get("PROSPECT") ?? 0,
      activeCount: countByStatus.get("ACTIVE") ?? 0,
      churnedCount: countByStatus.get("CHURNED") ?? 0,
    },
    byWorkspace,
    feedback: {
      topCategories7d: triageRows
        .filter((row) => Boolean(row.category))
        .map((row) => ({
          category: row.category ?? "OTHER",
          count: row._count._all,
        })),
    },
  };
}

type InteractionCounts = {
  viewed: number;
  markedDone: number;
  helpful: number;
  notHelpful: number;
};

function emptyInteractionCounts(): InteractionCounts {
  return { viewed: 0, markedDone: 0, helpful: 0, notHelpful: 0 };
}

type InsightBucket = {
  deliveryCount: number;
  interactions: InteractionCounts;
};

function toRateRow(bucket: InsightBucket): {
  deliveryCount: number;
  helpfulRatePct: number;
  notHelpfulRatePct: number;
  actionCompletionRatePct: number;
} {
  const quality = computeInsightQualityRates({
    helpful: bucket.interactions.helpful,
    notHelpful: bucket.interactions.notHelpful,
    viewed: bucket.interactions.viewed,
    markedDone: bucket.interactions.markedDone,
  });
  return {
    deliveryCount: bucket.deliveryCount,
    helpfulRatePct: quality.helpfulRatePct,
    notHelpfulRatePct: quality.notHelpfulRatePct,
    actionCompletionRatePct: quality.actionCompletionRatePct,
  };
}

export async function getOpsInsightsSummary(args: {
  windowDays: FunnelWindowDays;
  now?: Date;
}): Promise<OpsInsightsSummary> {
  const now = args.now ?? new Date();
  const windowStart = new Date(
    now.getTime() - args.windowDays * 24 * 60 * 60 * 1000,
  );

  const manualControlFlagEnabled = isOpsManualSkillControlEnabled();
  const fallbackManualControls = {
    discoveredSkillExecutionEnabled: ["1", "true", "yes", "on"].includes(
      (
        process.env.STARB_DISCOVERED_SKILL_EXEC_V1 ??
        (process.env.NODE_ENV === "production" ? "0" : "1")
      )
        .trim()
        .toLowerCase(),
    ),
    disabledSkillRefs: parseDisabledSkillRefsInput(
      process.env.STARB_DISABLED_SKILL_REFS ?? "",
    ),
  };

  const [
    deliveries,
    interactions,
    actionStates,
    traces,
    jobRuns,
    dbManualControls,
  ] = await Promise.all([
    prisma.insightDelivery.findMany({
      where: { createdAt: { gte: windowStart, lte: now } },
      select: {
        cardId: true,
        personaTrack: true,
        personaSubmode: true,
        skillRef: true,
        skillOrigin: true,
        modelSource: true,
      },
    }),
    prisma.insightInteraction.findMany({
      where: { createdAt: { gte: windowStart, lte: now } },
      select: {
        cardId: true,
        interactionType: true,
      },
    }),
    prisma.insightActionState.findMany({
      where: {
        createdAt: { gte: windowStart, lte: now },
        state: "DONE",
      },
      select: { cardId: true },
    }),
    prisma.skillExecutionTrace.findMany({
      where: { createdAt: { gte: windowStart, lte: now } },
      select: {
        decision: true,
        skillOrigin: true,
        expectedHelpfulLift: true,
        expectedActionLift: true,
      },
    }),
    prisma.jobRun.findMany({
      where: {
        kind: "NIGHTLY_WORKSPACE_RUN",
        createdAt: { gte: windowStart, lte: now },
      },
      select: {
        status: true,
        startedAt: true,
        finishedAt: true,
        meta: true,
      },
    }),
    manualControlFlagEnabled
      ? loadInsightManualControls()
      : Promise.resolve(defaultInsightManualControls),
  ]);

  const interactionsByCardId = new Map<string, InteractionCounts>();
  for (const interaction of interactions) {
    const counts =
      interactionsByCardId.get(interaction.cardId) ?? emptyInteractionCounts();
    if (interaction.interactionType === "VIEWED") {
      counts.viewed += 1;
    } else if (interaction.interactionType === "MARKED_DONE") {
      counts.markedDone += 1;
    } else if (interaction.interactionType === "HELPFUL") {
      counts.helpful += 1;
    } else if (interaction.interactionType === "NOT_HELPFUL") {
      counts.notHelpful += 1;
    }
    interactionsByCardId.set(interaction.cardId, counts);
  }

  const doneStateByCardId = new Map<string, number>();
  for (const state of actionStates) {
    doneStateByCardId.set(
      state.cardId,
      (doneStateByCardId.get(state.cardId) ?? 0) + 1,
    );
  }

  const byPersonaBuckets = new Map<string, InsightBucket>();
  const bySkillBuckets = new Map<string, InsightBucket>();
  const bySubmodeBuckets = new Map<string, InsightBucket>();
  let overallMarkedDone = 0;
  let overallViewed = 0;
  let overallHelpful = 0;
  let overallNotHelpful = 0;
  let codexEligibleDeliveries = 0;
  let fallbackDeliveries = 0;
  for (const delivery of deliveries) {
    const cardInteractions =
      interactionsByCardId.get(delivery.cardId) ?? emptyInteractionCounts();
    const markedDoneFromState = doneStateByCardId.get(delivery.cardId) ?? 0;
    const markedDone = Math.max(
      cardInteractions.markedDone,
      markedDoneFromState,
    );

    const personaKey = delivery.personaTrack;
    const personaBucket = byPersonaBuckets.get(personaKey) ?? {
      deliveryCount: 0,
      interactions: emptyInteractionCounts(),
    };
    personaBucket.deliveryCount += 1;
    personaBucket.interactions.viewed += cardInteractions.viewed;
    personaBucket.interactions.markedDone += markedDone;
    personaBucket.interactions.helpful += cardInteractions.helpful;
    personaBucket.interactions.notHelpful += cardInteractions.notHelpful;
    byPersonaBuckets.set(personaKey, personaBucket);

    const skillKey = (delivery.skillRef ?? "").trim();
    if (skillKey) {
      const skillBucket = bySkillBuckets.get(skillKey) ?? {
        deliveryCount: 0,
        interactions: emptyInteractionCounts(),
      };
      skillBucket.deliveryCount += 1;
      skillBucket.interactions.viewed += cardInteractions.viewed;
      skillBucket.interactions.markedDone += markedDone;
      skillBucket.interactions.helpful += cardInteractions.helpful;
      skillBucket.interactions.notHelpful += cardInteractions.notHelpful;
      bySkillBuckets.set(skillKey, skillBucket);
    }

    const submodeKey = delivery.personaSubmode;
    const submodeBucket = bySubmodeBuckets.get(submodeKey) ?? {
      deliveryCount: 0,
      interactions: emptyInteractionCounts(),
    };
    submodeBucket.deliveryCount += 1;
    submodeBucket.interactions.viewed += cardInteractions.viewed;
    submodeBucket.interactions.markedDone += markedDone;
    submodeBucket.interactions.helpful += cardInteractions.helpful;
    submodeBucket.interactions.notHelpful += cardInteractions.notHelpful;
    bySubmodeBuckets.set(submodeKey, submodeBucket);

    overallViewed += cardInteractions.viewed;
    overallMarkedDone += markedDone;
    overallHelpful += cardInteractions.helpful;
    overallNotHelpful += cardInteractions.notHelpful;

    if (
      delivery.modelSource === "local_codex" ||
      delivery.modelSource === "openai_hosted_shell" ||
      delivery.modelSource === "legacy_web_research"
    ) {
      codexEligibleDeliveries += 1;
      if (delivery.modelSource === "legacy_web_research") {
        fallbackDeliveries += 1;
      }
    }
  }

  let codexRuns = 0;
  let codexRetryRuns = 0;
  const durationsSec: number[] = [];
  for (const run of jobRuns) {
    if (run.startedAt && run.finishedAt) {
      const durationSec =
        (run.finishedAt.getTime() - run.startedAt.getTime()) / 1000;
      if (durationSec >= 0 && Number.isFinite(durationSec)) {
        durationsSec.push(durationSec);
      }
    }

    const meta = asObject(run.meta);
    const codex = asObject(meta?.codex);
    const estimates = asObject(codex?.estimates);
    const runs = readNumber(estimates?.runs);
    const retryRuns = readNumber(estimates?.retryRuns);
    if (typeof runs === "number") codexRuns += runs;
    if (typeof retryRuns === "number") codexRetryRuns += retryRuns;
  }
  const tokenAverages = codexTokenAverages(jobRuns);

  const quality = computeInsightQualityRates({
    helpful: overallHelpful,
    notHelpful: overallNotHelpful,
    viewed: overallViewed,
    markedDone: overallMarkedDone,
  });
  const manualControls = manualControlFlagEnabled
    ? dbManualControls
    : fallbackManualControls;

  const discoveredExecuted = traces.filter(
    (trace) =>
      trace.skillOrigin === "DISCOVERED" && trace.decision === "EXECUTED",
  );
  const discoveredSkipped = traces.filter(
    (trace) =>
      trace.skillOrigin === "DISCOVERED" && trace.decision !== "EXECUTED",
  );
  const discoveredHelpfulLiftAvg =
    discoveredExecuted.length > 0
      ? discoveredExecuted.reduce(
          (sum, row) => sum + (row.expectedHelpfulLift ?? 0),
          0,
        ) / discoveredExecuted.length
      : 0;
  const discoveredActionLiftAvg =
    discoveredExecuted.length > 0
      ? discoveredExecuted.reduce(
          (sum, row) => sum + (row.expectedActionLift ?? 0),
          0,
        ) / discoveredExecuted.length
      : 0;

  return {
    generatedAt: now.toISOString(),
    windowDays: args.windowDays,
    quality,
    byPersona: Array.from(byPersonaBuckets.entries())
      .map(([personaTrack, bucket]) => ({
        personaTrack,
        ...toRateRow(bucket),
      }))
      .sort((a, b) => b.deliveryCount - a.deliveryCount),
    bySkill: Array.from(bySkillBuckets.entries())
      .map(([skillRef, bucket]) => ({
        skillRef,
        ...toRateRow(bucket),
      }))
      .sort((a, b) => b.deliveryCount - a.deliveryCount),
    bySubmode: Array.from(bySubmodeBuckets.entries())
      .map(([personaSubmode, bucket]) => ({
        personaSubmode,
        ...toRateRow(bucket),
      }))
      .sort((a, b) => b.deliveryCount - a.deliveryCount),
    discoveredSkillRunner: {
      executedCount: discoveredExecuted.length,
      skippedByEvaluatorCount: discoveredSkipped.length,
      helpfulLiftPct: round1(discoveredHelpfulLiftAvg * 100),
      actionLiftPct: round1(discoveredActionLiftAvg * 100),
    },
    manualControls: {
      discoveredSkillExecutionEnabled:
        manualControls.discoveredSkillExecutionEnabled,
      disabledSkillRefs: manualControls.disabledSkillRefs,
    },
    runner: {
      p95DurationSec: Math.round(percentile(durationsSec, 95)),
      retryRatePct: toRate(codexRetryRuns, codexRuns),
      fallbackRatePct: toRate(fallbackDeliveries, codexEligibleDeliveries),
      avgInputTokens: tokenAverages.avgInputTokens,
      avgOutputTokens: tokenAverages.avgOutputTokens,
    },
  };
}
