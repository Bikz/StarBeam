import { prisma } from "@starbeam/db";
import { z } from "zod";

import { syncGoogleConnection, generateFocusTasks } from "../lib/google/sync";
import {
  isAuthRevoked as isGitHubAuthRevoked,
  syncGitHubConnection,
} from "../lib/integrations/github";
import {
  isAuthRevoked as isLinearAuthRevoked,
  syncLinearConnection,
} from "../lib/integrations/linear";
import {
  isAuthRevoked as isNotionAuthRevoked,
  syncNotionConnection,
} from "../lib/integrations/notion";

function isTruthyEnv(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes((value ?? "").trim().toLowerCase());
}

function pollIntervalMins(): number {
  const raw = (process.env.STARB_CONNECTOR_POLL_INTERVAL_MINS ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 240) return Math.floor(n);
  return 15;
}

function pollBatchSize(): number {
  const raw = (process.env.STARB_CONNECTOR_POLL_BATCH ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 200) return Math.floor(n);
  return 20;
}

function needsPoll(lastAt: Date | null | undefined, cutoff: Date): boolean {
  if (!lastAt) return true;
  return lastAt.getTime() <= cutoff.getTime();
}

function googleLastSyncAt(
  syncState: {
    lastGmailSyncAt: Date | null;
    lastCalendarSyncAt: Date | null;
    lastDriveSyncAt: Date | null;
  } | null,
): Date | null {
  if (!syncState) return null;
  const candidates = [
    syncState.lastGmailSyncAt,
    syncState.lastCalendarSyncAt,
    syncState.lastDriveSyncAt,
  ].filter((d): d is Date => d instanceof Date);
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (a.getTime() > b.getTime() ? a : b));
}

function isGoogleAuthRevoked(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("invalid_grant") ||
    msg.includes("reconnect required") ||
    msg.includes("refresh token missing")
  );
}

async function pollForUserInWorkspace(args: {
  workspaceId: string;
  userId: string;
  cutoff: Date;
}) {
  const [
    googleConnections,
    githubConnections,
    linearConnections,
    notionConnections,
  ] = await Promise.all([
    prisma.googleConnection.findMany({
      where: {
        workspaceId: args.workspaceId,
        ownerUserId: args.userId,
        status: { in: ["CONNECTED", "ERROR"] },
      },
      include: {
        syncState: {
          select: {
            lastGmailSyncAt: true,
            lastCalendarSyncAt: true,
            lastDriveSyncAt: true,
          },
        },
      },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.gitHubConnection.findMany({
      where: {
        workspaceId: args.workspaceId,
        ownerUserId: args.userId,
        status: { in: ["CONNECTED", "ERROR"] },
      },
      select: {
        id: true,
        githubLogin: true,
        repoSelectionMode: true,
        selectedRepoFullNames: true,
        lastSyncedAt: true,
      },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.linearConnection.findMany({
      where: {
        workspaceId: args.workspaceId,
        ownerUserId: args.userId,
        status: { in: ["CONNECTED", "ERROR"] },
      },
      select: { id: true, linearUserEmail: true, lastSyncedAt: true },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.notionConnection.findMany({
      where: {
        workspaceId: args.workspaceId,
        ownerUserId: args.userId,
        status: { in: ["CONNECTED", "ERROR"] },
      },
      select: { id: true, notionWorkspaceName: true, lastSyncedAt: true },
      orderBy: { updatedAt: "asc" },
    }),
  ]);

  for (const c of googleConnections) {
    const last = googleLastSyncAt(c.syncState);
    if (!needsPoll(last, args.cutoff)) continue;

    try {
      await syncGoogleConnection({
        workspaceId: args.workspaceId,
        userId: args.userId,
        connectionId: c.id,
      });
      await prisma.googleConnection
        .update({ where: { id: c.id }, data: { status: "CONNECTED" } })
        .catch(() => undefined);
      await generateFocusTasks({
        workspaceId: args.workspaceId,
        userId: args.userId,
      }).catch(() => undefined);
    } catch (err) {
      const status = isGoogleAuthRevoked(err) ? "REVOKED" : "ERROR";
      await prisma.googleConnection
        .update({ where: { id: c.id }, data: { status } })
        .catch(() => undefined);
    }
  }

  for (const c of githubConnections) {
    if (!needsPoll(c.lastSyncedAt, args.cutoff)) continue;
    if (
      c.repoSelectionMode === "SELECTED" &&
      (c.selectedRepoFullNames ?? []).filter(Boolean).length === 0
    )
      continue;

    try {
      await syncGitHubConnection({
        workspaceId: args.workspaceId,
        userId: args.userId,
        connectionId: c.id,
      });
    } catch (err) {
      const status = isGitHubAuthRevoked(err) ? "REVOKED" : "ERROR";
      await prisma.gitHubConnection
        .update({ where: { id: c.id }, data: { status } })
        .catch(() => undefined);
    }
  }

  for (const c of linearConnections) {
    if (!needsPoll(c.lastSyncedAt, args.cutoff)) continue;
    try {
      await syncLinearConnection({
        workspaceId: args.workspaceId,
        userId: args.userId,
        connectionId: c.id,
      });
    } catch (err) {
      const status = isLinearAuthRevoked(err) ? "REVOKED" : "ERROR";
      await prisma.linearConnection
        .update({ where: { id: c.id }, data: { status } })
        .catch(() => undefined);
    }
  }

  for (const c of notionConnections) {
    if (!needsPoll(c.lastSyncedAt, args.cutoff)) continue;
    try {
      await syncNotionConnection({
        workspaceId: args.workspaceId,
        userId: args.userId,
        connectionId: c.id,
      });
    } catch (err) {
      const status = isNotionAuthRevoked(err) ? "REVOKED" : "ERROR";
      await prisma.notionConnection
        .update({ where: { id: c.id }, data: { status } })
        .catch(() => undefined);
    }
  }
}

// Global recurring poll task: keep connector-derived signals reasonably fresh
// without generating pulses. v0 uses polling; webhooks can come later.
export async function connector_poll() {
  if (!isTruthyEnv(process.env.STARB_CONNECTOR_POLL_ENABLED ?? "1")) return;

  const intervalMins = pollIntervalMins();
  const batch = pollBatchSize();
  const now = new Date();
  const cutoff = new Date(now.getTime() - intervalMins * 60 * 1000);

  // Build a small batch of (workspaceId,userId) pairs from any connector type.
  // This avoids syncing every user every tick while still converging quickly.
  const pairs = new Map<string, { workspaceId: string; userId: string }>();

  const addPair = (workspaceId: string, userId: string) => {
    pairs.set(`${workspaceId}:${userId}`, { workspaceId, userId });
  };

  const [google, github, linear, notion] = await Promise.all([
    prisma.googleConnection.findMany({
      where: { status: { in: ["CONNECTED", "ERROR"] } },
      select: { workspaceId: true, ownerUserId: true },
      orderBy: { updatedAt: "asc" },
      take: batch,
    }),
    prisma.gitHubConnection.findMany({
      where: {
        status: { in: ["CONNECTED", "ERROR"] },
        OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lte: cutoff } }],
      },
      select: { workspaceId: true, ownerUserId: true },
      orderBy: [{ lastSyncedAt: "asc" }, { updatedAt: "asc" }],
      take: batch,
    }),
    prisma.linearConnection.findMany({
      where: {
        status: { in: ["CONNECTED", "ERROR"] },
        OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lte: cutoff } }],
      },
      select: { workspaceId: true, ownerUserId: true },
      orderBy: [{ lastSyncedAt: "asc" }, { updatedAt: "asc" }],
      take: batch,
    }),
    prisma.notionConnection.findMany({
      where: {
        status: { in: ["CONNECTED", "ERROR"] },
        OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lte: cutoff } }],
      },
      select: { workspaceId: true, ownerUserId: true },
      orderBy: [{ lastSyncedAt: "asc" }, { updatedAt: "asc" }],
      take: batch,
    }),
  ]);

  for (const c of google) addPair(c.workspaceId, c.ownerUserId);
  for (const c of github) addPair(c.workspaceId, c.ownerUserId);
  for (const c of linear) addPair(c.workspaceId, c.ownerUserId);
  for (const c of notion) addPair(c.workspaceId, c.ownerUserId);

  const list = Array.from(pairs.values()).slice(0, batch);
  for (const p of list) {
    await pollForUserInWorkspace({
      workspaceId: p.workspaceId,
      userId: p.userId,
      cutoff,
    });
  }
}

const ConnectorPollOnePayloadSchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
});

export async function connector_poll_one(payload: unknown) {
  const parsed = ConnectorPollOnePayloadSchema.safeParse(payload);
  if (!parsed.success) throw new Error("Invalid poll payload");

  const intervalMins = pollIntervalMins();
  const now = new Date();
  const cutoff = new Date(now.getTime() - intervalMins * 60 * 1000);

  await pollForUserInWorkspace({
    workspaceId: parsed.data.workspaceId,
    userId: parsed.data.userId,
    cutoff,
  });
}
