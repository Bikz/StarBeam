import { timingSafeEqual } from "node:crypto";

import { prisma } from "@starbeam/db";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { authOptions } from "@/lib/auth";

type ConnectorStatusRow = {
  status: string;
  _count: { _all: number };
};

type ConnectorSummary = {
  total: number;
  connected: number;
  error: number;
  revoked: number;
  staleActive: number;
};

function pollIntervalMins(): number {
  const raw = (process.env.STARB_CONNECTOR_POLL_INTERVAL_MINS ?? "").trim();
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 240) {
    return Math.floor(parsed);
  }
  return 15;
}

function noStoreJson(body: unknown, init?: ResponseInit): NextResponse {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(body, { ...init, headers });
}

function parseBearerToken(value: string | null): string | null {
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  const token = match?.[1]?.trim() ?? "";
  return token || null;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

async function hasOpsAccess(request: Request): Promise<boolean> {
  const staticToken = (process.env.STARB_OPS_METRICS_TOKEN ?? "").trim();
  if (staticToken) {
    const incoming = parseBearerToken(request.headers.get("authorization"));
    if (incoming && safeEqual(incoming, staticToken)) return true;
  }

  const session = await getServerSession(authOptions);
  return Boolean(session?.user?.email && isAdminEmail(session.user.email));
}

function summarizeConnector(
  rows: ConnectorStatusRow[],
  staleActive: number,
): ConnectorSummary {
  let connected = 0;
  let error = 0;
  let revoked = 0;

  for (const row of rows) {
    if (row.status === "CONNECTED") connected = row._count._all;
    if (row.status === "ERROR") error = row._count._all;
    if (row.status === "REVOKED") revoked = row._count._all;
  }

  return {
    total: connected + error + revoked,
    connected,
    error,
    revoked,
    staleActive,
  };
}

function buildJobStatusMap() {
  return {
    QUEUED: 0,
    RUNNING: 0,
    SUCCEEDED: 0,
    FAILED: 0,
    PARTIAL: 0,
  };
}

export async function GET(request: Request) {
  const allowed = await hasOpsAccess(request);
  if (!allowed) {
    return noStoreJson({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const jobWindowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const intervalMins = pollIntervalMins();
  const pollCutoff = new Date(now.getTime() - intervalMins * 60 * 1000);

  const [
    workspaceCount,
    userCount,
    jobRows,
    oldestRunning,
    googleRows,
    githubRows,
    linearRows,
    notionRows,
    googleStaleActive,
    githubStaleActive,
    linearStaleActive,
    notionStaleActive,
  ] = await Promise.all([
    prisma.workspace.count(),
    prisma.user.count(),
    prisma.jobRun.groupBy({
      by: ["kind", "status"],
      where: { createdAt: { gte: jobWindowStart } },
      _count: { _all: true },
    }),
    prisma.jobRun.findFirst({
      where: { status: "RUNNING" },
      orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        kind: true,
        workspaceId: true,
        startedAt: true,
        createdAt: true,
      },
    }),
    prisma.googleConnection.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.gitHubConnection.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.linearConnection.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.notionConnection.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.googleConnection.count({
      where: {
        status: { in: ["CONNECTED", "ERROR"] },
        OR: [
          { lastAttemptedAt: null },
          { lastAttemptedAt: { lte: pollCutoff } },
        ],
      },
    }),
    prisma.gitHubConnection.count({
      where: {
        status: { in: ["CONNECTED", "ERROR"] },
        OR: [
          { lastAttemptedAt: null },
          { lastAttemptedAt: { lte: pollCutoff } },
        ],
      },
    }),
    prisma.linearConnection.count({
      where: {
        status: { in: ["CONNECTED", "ERROR"] },
        OR: [
          { lastAttemptedAt: null },
          { lastAttemptedAt: { lte: pollCutoff } },
        ],
      },
    }),
    prisma.notionConnection.count({
      where: {
        status: { in: ["CONNECTED", "ERROR"] },
        OR: [
          { lastAttemptedAt: null },
          { lastAttemptedAt: { lte: pollCutoff } },
        ],
      },
    }),
  ]);

  const totals = buildJobStatusMap();
  const byKind = new Map<string, ReturnType<typeof buildJobStatusMap>>();

  for (const row of jobRows) {
    if (!(row.status in totals)) continue;
    totals[row.status] += row._count._all;

    const existing = byKind.get(row.kind) ?? buildJobStatusMap();
    existing[row.status] += row._count._all;
    byKind.set(row.kind, existing);
  }

  const runningSince =
    oldestRunning?.startedAt ?? oldestRunning?.createdAt ?? null;
  const runningAgeMinutes = runningSince
    ? Math.floor((now.getTime() - runningSince.getTime()) / 60_000)
    : null;

  return noStoreJson({
    ok: true,
    generatedAt: now.toISOString(),
    requestId: request.headers.get("x-request-id") ?? null,
    jobWindowStart: jobWindowStart.toISOString(),
    pollCutoff: pollCutoff.toISOString(),
    pollIntervalMins: intervalMins,
    population: {
      workspaces: workspaceCount,
      users: userCount,
    },
    jobs: {
      totals,
      byKind: Array.from(byKind.entries())
        .map(([kind, counts]) => ({ kind, counts }))
        .sort((a, b) => a.kind.localeCompare(b.kind)),
      oldestRunning: oldestRunning
        ? {
            id: oldestRunning.id,
            kind: oldestRunning.kind,
            workspaceId: oldestRunning.workspaceId,
            startedAt: runningSince?.toISOString() ?? null,
            ageMinutes: runningAgeMinutes,
          }
        : null,
    },
    connectors: {
      google: summarizeConnector(
        googleRows as ConnectorStatusRow[],
        googleStaleActive,
      ),
      github: summarizeConnector(
        githubRows as ConnectorStatusRow[],
        githubStaleActive,
      ),
      linear: summarizeConnector(
        linearRows as ConnectorStatusRow[],
        linearStaleActive,
      ),
      notion: summarizeConnector(
        notionRows as ConnectorStatusRow[],
        notionStaleActive,
      ),
    },
  });
}
