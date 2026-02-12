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
import { captureTaskError } from "../lib/sentry";

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

type ConnectorProvider = "google" | "github" | "linear" | "notion";

type ProviderPollSummary = {
  discovered: number;
  due: number;
  claimed: number;
  synced: number;
  errors: number;
  revoked: number;
  skipped: number;
};

type ConnectorPollSummary = Record<ConnectorProvider, ProviderPollSummary>;

const CONNECTOR_PROVIDERS: ConnectorProvider[] = [
  "google",
  "github",
  "linear",
  "notion",
];

function emptyProviderPollSummary(): ProviderPollSummary {
  return {
    discovered: 0,
    due: 0,
    claimed: 0,
    synced: 0,
    errors: 0,
    revoked: 0,
    skipped: 0,
  };
}

function createConnectorPollSummary(): ConnectorPollSummary {
  return {
    google: emptyProviderPollSummary(),
    github: emptyProviderPollSummary(),
    linear: emptyProviderPollSummary(),
    notion: emptyProviderPollSummary(),
  };
}

function mergeConnectorPollSummary(
  into: ConnectorPollSummary,
  part: ConnectorPollSummary,
): void {
  for (const provider of CONNECTOR_PROVIDERS) {
    into[provider].discovered += part[provider].discovered;
    into[provider].due += part[provider].due;
    into[provider].claimed += part[provider].claimed;
    into[provider].synced += part[provider].synced;
    into[provider].errors += part[provider].errors;
    into[provider].revoked += part[provider].revoked;
    into[provider].skipped += part[provider].skipped;
  }
}

async function pollForUserInWorkspace(args: {
  workspaceId: string;
  userId: string;
  cutoff: Date;
  now: Date;
}): Promise<ConnectorPollSummary> {
  const summary = createConnectorPollSummary();
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
  summary.google.discovered = googleConnections.length;
  summary.github.discovered = githubConnections.length;
  summary.linear.discovered = linearConnections.length;
  summary.notion.discovered = notionConnections.length;

  for (const c of googleConnections) {
    if (!needsPoll(c.lastAttemptedAt, args.cutoff)) {
      summary.google.skipped += 1;
      continue;
    }
    summary.google.due += 1;

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
    if (claimed.count !== 1) {
      summary.google.skipped += 1;
      continue;
    }
    summary.google.claimed += 1;

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
      summary.google.synced += 1;
    } catch (err) {
      const status = isGoogleAuthRevoked(err) ? "REVOKED" : "ERROR";
      summary.google.errors += 1;
      if (status === "REVOKED") summary.google.revoked += 1;
      await prisma.googleConnection
        .update({ where: { id: c.id }, data: { status } })
        .catch(() => undefined);
      captureTaskError({
        task: "connector_poll",
        error: err,
        payload: {
          provider: "google",
          workspaceId: args.workspaceId,
          userId: args.userId,
          connectionId: c.id,
        },
        tags: {
          provider: "google",
          workspaceId: args.workspaceId,
          status,
        },
      });
    }
  }

  for (const c of githubConnections) {
    if (!needsPoll(c.lastAttemptedAt, args.cutoff)) {
      summary.github.skipped += 1;
      continue;
    }
    summary.github.due += 1;

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
    if (claimed.count !== 1) {
      summary.github.skipped += 1;
      continue;
    }
    summary.github.claimed += 1;
    if (
      c.repoSelectionMode === "SELECTED" &&
      (c.selectedRepoFullNames ?? []).filter(Boolean).length === 0
    ) {
      summary.github.skipped += 1;
      continue;
    }

    try {
      await syncGitHubConnection({
        workspaceId: args.workspaceId,
        userId: args.userId,
        connectionId: c.id,
      });
      summary.github.synced += 1;
    } catch (err) {
      const status = isGitHubAuthRevoked(err) ? "REVOKED" : "ERROR";
      summary.github.errors += 1;
      if (status === "REVOKED") summary.github.revoked += 1;
      await prisma.gitHubConnection
        .update({ where: { id: c.id }, data: { status } })
        .catch(() => undefined);
      captureTaskError({
        task: "connector_poll",
        error: err,
        payload: {
          provider: "github",
          workspaceId: args.workspaceId,
          userId: args.userId,
          connectionId: c.id,
          githubLogin: c.githubLogin,
        },
        tags: {
          provider: "github",
          workspaceId: args.workspaceId,
          status,
        },
      });
    }
  }

  for (const c of linearConnections) {
    if (!needsPoll(c.lastAttemptedAt, args.cutoff)) {
      summary.linear.skipped += 1;
      continue;
    }
    summary.linear.due += 1;

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
    if (claimed.count !== 1) {
      summary.linear.skipped += 1;
      continue;
    }
    summary.linear.claimed += 1;
    try {
      await syncLinearConnection({
        workspaceId: args.workspaceId,
        userId: args.userId,
        connectionId: c.id,
      });
      summary.linear.synced += 1;
    } catch (err) {
      const status = isLinearAuthRevoked(err) ? "REVOKED" : "ERROR";
      summary.linear.errors += 1;
      if (status === "REVOKED") summary.linear.revoked += 1;
      await prisma.linearConnection
        .update({ where: { id: c.id }, data: { status } })
        .catch(() => undefined);
      captureTaskError({
        task: "connector_poll",
        error: err,
        payload: {
          provider: "linear",
          workspaceId: args.workspaceId,
          userId: args.userId,
          connectionId: c.id,
          linearUserEmail: c.linearUserEmail,
        },
        tags: {
          provider: "linear",
          workspaceId: args.workspaceId,
          status,
        },
      });
    }
  }

  for (const c of notionConnections) {
    if (!needsPoll(c.lastAttemptedAt, args.cutoff)) {
      summary.notion.skipped += 1;
      continue;
    }
    summary.notion.due += 1;

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
    if (claimed.count !== 1) {
      summary.notion.skipped += 1;
      continue;
    }
    summary.notion.claimed += 1;
    try {
      await syncNotionConnection({
        workspaceId: args.workspaceId,
        userId: args.userId,
        connectionId: c.id,
      });
      summary.notion.synced += 1;
    } catch (err) {
      const status = isNotionAuthRevoked(err) ? "REVOKED" : "ERROR";
      summary.notion.errors += 1;
      if (status === "REVOKED") summary.notion.revoked += 1;
      await prisma.notionConnection
        .update({ where: { id: c.id }, data: { status } })
        .catch(() => undefined);
      captureTaskError({
        task: "connector_poll",
        error: err,
        payload: {
          provider: "notion",
          workspaceId: args.workspaceId,
          userId: args.userId,
          connectionId: c.id,
          notionWorkspaceName: c.notionWorkspaceName,
        },
        tags: {
          provider: "notion",
          workspaceId: args.workspaceId,
          status,
        },
      });
    }
  }

  return summary;
}

// Global recurring poll task: keep connector-derived signals reasonably fresh
// without generating pulses. v0 uses polling; webhooks can come later.
export async function connector_poll() {
  if (!isTruthyEnv(process.env.STARB_CONNECTOR_POLL_ENABLED ?? "1")) return;

  const startedAt = Date.now();
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
  const runSummary = createConnectorPollSummary();

  for (const p of list) {
    const pairSummary = await pollForUserInWorkspace({
      workspaceId: p.workspaceId,
      userId: p.userId,
      cutoff,
      now,
    });
    mergeConnectorPollSummary(runSummary, pairSummary);
  }

  // eslint-disable-next-line no-console
  console.log("[connector_poll] summary", {
    intervalMins,
    batch,
    durationMs: Date.now() - startedAt,
    candidates: {
      google: google.length,
      github: github.length,
      linear: linear.length,
      notion: notion.length,
    },
    selectedPairs: list.length,
    summary: runSummary,
  });
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
