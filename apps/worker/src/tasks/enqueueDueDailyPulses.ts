import { prisma } from "@starbeam/db";
import { makeWorkerUtils } from "graphile-worker";

import { hourInTimeZone, isValidIanaTimeZone, startOfDayKeyUtcForTimeZone } from "../lib/dates";

function requireDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL");
  return connectionString;
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function withinWindow(args: { hour: number; startHour: number; endHour: number }): boolean {
  const { hour } = args;
  const start = ((args.startHour % 24) + 24) % 24;
  const end = ((args.endHour % 24) + 24) % 24;

  if (start === end) return true; // whole day
  if (start < end) return hour >= start && hour < end;
  // Wrap-around window (e.g. 22 -> 2)
  return hour >= start || hour < end;
}

function dailyJobRunId(args: { workspaceId: string; userId: string; dateKey: string }): string {
  return `daily:${args.workspaceId}:${args.userId}:${args.dateKey}`;
}

function dailyJobKey(args: { workspaceId: string; userId: string; dateKey: string }): string {
  return `nightly_workspace_run:daily:${args.workspaceId}:${args.userId}:${args.dateKey}`;
}

// Enqueue per-user daily pulses during a small user-local window (2-5am by default).
// This lets the app "feel alive" each morning without needing users to click "Run now".
export async function enqueue_due_daily_pulses(): Promise<void> {
  const enabled = (process.env.STARB_DAILY_PULSE_ENABLED ?? "1").trim().toLowerCase();
  if (!["1", "true", "yes"].includes(enabled)) return;

  const startHour = parseIntEnv("STARB_DAILY_PULSE_WINDOW_START_HOUR", 2);
  const endHour = parseIntEnv("STARB_DAILY_PULSE_WINDOW_END_HOUR", 5);
  const batch = Math.min(500, Math.max(1, parseIntEnv("STARB_DAILY_PULSE_ENQUEUE_BATCH", 200)));

  const now = new Date();

  const memberships = await prisma.membership.findMany({
    select: {
      workspaceId: true,
      userId: true,
      user: { select: { timezone: true } },
    },
    orderBy: { createdAt: "asc" },
    take: batch,
  });

  const connectionString = requireDatabaseUrl();
  const workerUtils = await makeWorkerUtils({ connectionString });

  try {
    for (const m of memberships) {
      const tzRaw = (m.user.timezone ?? "UTC").trim() || "UTC";
      const tz = isValidIanaTimeZone(tzRaw) ? tzRaw : "UTC";

      const hour = hourInTimeZone(now, tz);
      if (!withinWindow({ hour, startHour, endHour })) continue;

      const editionDate = startOfDayKeyUtcForTimeZone(now, tz);
      const dateKey = editionDate.toISOString().slice(0, 10);

      const existing = await prisma.pulseEdition.findUnique({
        where: {
          workspaceId_userId_editionDate: {
            workspaceId: m.workspaceId,
            userId: m.userId,
            editionDate,
          },
        },
        select: { id: true, status: true },
      });

      // If a pulse already exists (or is currently generating) for this user/day,
      // don't enqueue another.
      if (existing && (existing.status === "READY" || existing.status === "GENERATING")) {
        continue;
      }

      const jobRunId = dailyJobRunId({ workspaceId: m.workspaceId, userId: m.userId, dateKey });
      const jobKey = dailyJobKey({ workspaceId: m.workspaceId, userId: m.userId, dateKey });

      await prisma.jobRun.upsert({
        where: { id: jobRunId },
        update: {
          workspaceId: m.workspaceId,
          kind: "NIGHTLY_WORKSPACE_RUN",
          status: "QUEUED",
          startedAt: null,
          finishedAt: null,
          errorSummary: null,
          meta: { source: "daily", userId: m.userId, timezone: tz, editionDate: dateKey, jobKey },
        },
        create: {
          id: jobRunId,
          workspaceId: m.workspaceId,
          kind: "NIGHTLY_WORKSPACE_RUN",
          status: "QUEUED",
          meta: { source: "daily", userId: m.userId, timezone: tz, editionDate: dateKey, jobKey },
        },
      });

      await workerUtils.addJob(
        "nightly_workspace_run",
        { workspaceId: m.workspaceId, userId: m.userId, jobRunId },
        { jobKey, jobKeyMode: "unsafe_dedupe", runAt: now },
      );
    }
  } finally {
    await workerUtils.release();
  }
}

