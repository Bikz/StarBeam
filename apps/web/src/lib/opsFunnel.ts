import { prisma } from "@starbeam/db";

import { usageEventTypes } from "@/lib/usageEvents";

export type FunnelWindowDays = 7 | 28;
export type DesignPartnerStatusFilter = "ALL" | "PROSPECT" | "ACTIVE" | "CHURNED";

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

export type OpsFunnelSummary = {
  generatedAt: string;
  windowDays: FunnelWindowDays;
  activation: ActivationSummary;
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

export function parseWindowDays(input: string | null | undefined): FunnelWindowDays {
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
  const windowStart = new Date(now.getTime() - args.windowDays * 24 * 60 * 60 * 1000);
  const feedbackWindowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const programStatusFilter = args.programStatusFilter ?? "ALL";

  const [events, designPartnerCounts, designPartnerWorkspaces, triageRowsRaw] =
    await Promise.all([
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
    ]);

  const typedEvents = events as UsageEventRow[];
  const triageRows = (
    triageRowsRaw as Array<{ category: string | null; _count: { _all: number } }>
  ).sort((a, b) => b._count._all - a._count._all);
  const funnel = computeFunnelFromEvents(typedEvents);

  const byWorkspace: WorkspaceFunnelSummary[] = designPartnerWorkspaces.map((workspace) => ({
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
  }));

  const countByStatus = new Map<string, number>();
  for (const row of designPartnerCounts) {
    countByStatus.set(row.programStatus, row._count._all);
  }

  return {
    generatedAt: now.toISOString(),
    windowDays: args.windowDays,
    activation: funnel.activation,
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
