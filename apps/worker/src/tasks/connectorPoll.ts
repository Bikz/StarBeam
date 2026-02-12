import { prisma } from "@starbeam/db";
import { z } from "zod";

import {
  syncGoogleConnection,
  generateFocusTasks,
  isGoogleAuthRevoked,
} from "../lib/google/sync";
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
import {
  selectPairsRoundRobin,
  type WorkspaceUserPair,
} from "../lib/roundRobin";

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

async function pollForUserInWorkspace(args: {
  workspaceId: string;
  userId: string;
  cutoff: Date;
  now: Date;
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
      select: { id: true, status: true, lastAttemptedAt: true },
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
        lastAttemptedAt: true,
      },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.linearConnection.findMany({
      where: {
        workspaceId: args.workspaceId,
        ownerUserId: args.userId,
        status: { in: ["CONNECTED", "ERROR"] },
      },
      select: {
        id: true,
        linearUserEmail: true,
        lastSyncedAt: true,
        lastAttemptedAt: true,
      },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.notionConnection.findMany({
      where: {
        workspaceId: args.workspaceId,
        ownerUserId: args.userId,
        status: { in: ["CONNECTED", "ERROR"] },
      },
      select: {
        id: true,
        notionWorkspaceName: true,
        lastSyncedAt: true,
        lastAttemptedAt: true,
      },
      orderBy: { updatedAt: "asc" },
    }),
  ]);

  for (const c of googleConnections) {
    if (!needsPoll(c.lastAttemptedAt, args.cutoff)) continue;

    const claimed = await prisma.googleConnection.updateMany({
      where: {
        id: c.id,
        OR: [
          { lastAttemptedAt: null },
          { lastAttemptedAt: { lte: args.cutoff } },
        ],
      },
      data: { lastAttemptedAt: args.now },
    });
    if (claimed.count !== 1) continue;

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
    if (!needsPoll(c.lastAttemptedAt, args.cutoff)) continue;

    const claimed = await prisma.gitHubConnection.updateMany({
      where: {
        id: c.id,
        OR: [
          { lastAttemptedAt: null },
          { lastAttemptedAt: { lte: args.cutoff } },
        ],
      },
      data: { lastAttemptedAt: args.now },
    });
    if (claimed.count !== 1) continue;
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
    if (!needsPoll(c.lastAttemptedAt, args.cutoff)) continue;

    const claimed = await prisma.linearConnection.updateMany({
      where: {
        id: c.id,
        OR: [
          { lastAttemptedAt: null },
          { lastAttemptedAt: { lte: args.cutoff } },
        ],
      },
      data: { lastAttemptedAt: args.now },
    });
    if (claimed.count !== 1) continue;
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
    if (!needsPoll(c.lastAttemptedAt, args.cutoff)) continue;

    const claimed = await prisma.notionConnection.updateMany({
      where: {
        id: c.id,
        OR: [
          { lastAttemptedAt: null },
          { lastAttemptedAt: { lte: args.cutoff } },
        ],
      },
      data: { lastAttemptedAt: args.now },
    });
    if (claimed.count !== 1) continue;
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

  const [google, github, linear, notion] = await Promise.all([
    prisma.googleConnection.findMany({
      where: {
        status: { in: ["CONNECTED", "ERROR"] },
        OR: [{ lastAttemptedAt: null }, { lastAttemptedAt: { lte: cutoff } }],
      },
      select: { workspaceId: true, ownerUserId: true },
      orderBy: [{ lastAttemptedAt: "asc" }, { updatedAt: "asc" }],
      take: batch,
    }),
    prisma.gitHubConnection.findMany({
      where: {
        status: { in: ["CONNECTED", "ERROR"] },
        OR: [{ lastAttemptedAt: null }, { lastAttemptedAt: { lte: cutoff } }],
      },
      select: { workspaceId: true, ownerUserId: true },
      orderBy: [{ lastAttemptedAt: "asc" }, { updatedAt: "asc" }],
      take: batch,
    }),
    prisma.linearConnection.findMany({
      where: {
        status: { in: ["CONNECTED", "ERROR"] },
        OR: [{ lastAttemptedAt: null }, { lastAttemptedAt: { lte: cutoff } }],
      },
      select: { workspaceId: true, ownerUserId: true },
      orderBy: [{ lastAttemptedAt: "asc" }, { updatedAt: "asc" }],
      take: batch,
    }),
    prisma.notionConnection.findMany({
      where: {
        status: { in: ["CONNECTED", "ERROR"] },
        OR: [{ lastAttemptedAt: null }, { lastAttemptedAt: { lte: cutoff } }],
      },
      select: { workspaceId: true, ownerUserId: true },
      orderBy: [{ lastAttemptedAt: "asc" }, { updatedAt: "asc" }],
      take: batch,
    }),
  ]);

  const googlePairs: WorkspaceUserPair[] = google.map((c) => ({
    workspaceId: c.workspaceId,
    userId: c.ownerUserId,
  }));
  const githubPairs: WorkspaceUserPair[] = github.map((c) => ({
    workspaceId: c.workspaceId,
    userId: c.ownerUserId,
  }));
  const linearPairs: WorkspaceUserPair[] = linear.map((c) => ({
    workspaceId: c.workspaceId,
    userId: c.ownerUserId,
  }));
  const notionPairs: WorkspaceUserPair[] = notion.map((c) => ({
    workspaceId: c.workspaceId,
    userId: c.ownerUserId,
  }));

  const list = selectPairsRoundRobin({
    lists: [googlePairs, githubPairs, linearPairs, notionPairs],
    limit: batch,
  });

  for (const p of list) {
    await pollForUserInWorkspace({
      workspaceId: p.workspaceId,
      userId: p.userId,
      cutoff,
      now,
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
    now,
  });
}
