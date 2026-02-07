import { prisma } from "@starbeam/db";
import { makeWorkerUtils } from "graphile-worker";

import { hourInTimeZone, isValidIanaTimeZone, startOfDayKeyUtcForTimeZone } from "../lib/dates";

type SchedulerCursor = { createdAt: string; id: string };

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

function isTruthyEnv(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes((value ?? "").trim().toLowerCase());
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

function eligibleNow(args: { hour: number; startHour: number; endHour: number; strictWindow: boolean }): boolean {
  if (args.strictWindow) return withinWindow({ hour: args.hour, startHour: args.startHour, endHour: args.endHour });
  // Softer window: once a user's local time passes the start hour, we consider them
  // eligible for the rest of the day. This improves "guaranteed coverage" for large
  // orgs where the enqueue scan might take longer than a fixed 2-5am window.
  const start = ((args.startHour % 24) + 24) % 24;
  return args.hour >= start;
}

function dailyJobRunId(args: { workspaceId: string; userId: string; dateKey: string }): string {
  return `daily:${args.workspaceId}:${args.userId}:${args.dateKey}`;
}

function dailyJobKey(args: { workspaceId: string; userId: string; dateKey: string }): string {
  return `nightly_workspace_run:daily:${args.workspaceId}:${args.userId}:${args.dateKey}`;
}

const CURSOR_KEY = "daily_pulse_membership_cursor";

function encodeCursor(cursor: SchedulerCursor | null): string | null {
  if (!cursor) return null;
  return JSON.stringify(cursor);
}

function decodeCursor(raw: string | null | undefined): SchedulerCursor | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  try {
    const parsed = JSON.parse(s) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") return null;
    if (!parsed.createdAt.trim() || !parsed.id.trim()) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

async function getCursor(): Promise<SchedulerCursor | null> {
  const row = await prisma.schedulerState.findUnique({
    where: { key: CURSOR_KEY },
    select: { cursor: true },
  });
  return decodeCursor(row?.cursor);
}

async function setCursor(cursor: SchedulerCursor | null): Promise<void> {
  const encoded = encodeCursor(cursor);
  await prisma.schedulerState.upsert({
    where: { key: CURSOR_KEY },
    update: { cursor: encoded },
    create: { key: CURSOR_KEY, cursor: encoded },
  });
}

function membershipCursorWhere(cursor: SchedulerCursor | null) {
  if (!cursor) return {};
  const createdAt = new Date(cursor.createdAt);
  if (!Number.isFinite(createdAt.getTime())) return {};

  return {
    OR: [
      { createdAt: { gt: createdAt } },
      { createdAt, id: { gt: cursor.id } },
    ],
  } as const;
}

async function tryAcquireSchedulerLock(): Promise<boolean> {
  // Two-int advisory lock key. Keep stable forever to avoid changing behavior
  // across deployments.
  const rows = await prisma.$queryRawUnsafe<{ ok: boolean }[]>(
    "select pg_try_advisory_lock($1, $2) as ok",
    8011,
    41027,
  );
  return Boolean(rows?.[0]?.ok);
}

async function releaseSchedulerLock(): Promise<void> {
  await prisma.$executeRawUnsafe("select pg_advisory_unlock($1, $2)", 8011, 41027);
}

// Enqueue per-user daily pulses during a small user-local window (2-5am by default).
// This lets the app "feel alive" each morning without needing users to click "Run now".
export async function enqueue_due_daily_pulses(): Promise<void> {
  const enabled = (process.env.STARB_DAILY_PULSE_ENABLED ?? "1").trim().toLowerCase();
  if (!["1", "true", "yes"].includes(enabled)) return;

  const startHour = parseIntEnv("STARB_DAILY_PULSE_WINDOW_START_HOUR", 2);
  const endHour = parseIntEnv("STARB_DAILY_PULSE_WINDOW_END_HOUR", 5);
  const batch = Math.min(500, Math.max(1, parseIntEnv("STARB_DAILY_PULSE_ENQUEUE_BATCH", 200)));
  const maxPages = Math.min(200, Math.max(1, parseIntEnv("STARB_DAILY_PULSE_MAX_PAGES_PER_TICK", 25)));
  const strictWindow = isTruthyEnv(process.env.STARB_DAILY_PULSE_STRICT_WINDOW);
  const maxRuntimeMs = Math.min(5 * 60_000, Math.max(5_000, parseIntEnv("STARB_DAILY_PULSE_MAX_RUNTIME_MS", 25_000)));

  const now = new Date();

  const haveLock = await tryAcquireSchedulerLock();
  if (!haveLock) return;

  const connectionString = requireDatabaseUrl();
  const workerUtils = await makeWorkerUtils({ connectionString });

  try {
    const deadline = Date.now() + maxRuntimeMs;
    let cursor = await getCursor();
    let looped = false;

    for (let page = 0; page < maxPages && Date.now() < deadline; page += 1) {
      const memberships = await prisma.membership.findMany({
        select: {
          id: true,
          createdAt: true,
          workspaceId: true,
          userId: true,
          user: { select: { timezone: true } },
        },
        where: membershipCursorWhere(cursor),
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: batch,
      });

      if (memberships.length === 0) {
        if (looped) break;
        cursor = null;
        await setCursor(cursor);
        looped = true;
        continue;
      }

      for (const m of memberships) {
        const tzRaw = (m.user.timezone ?? "UTC").trim() || "UTC";
        const tz = isValidIanaTimeZone(tzRaw) ? tzRaw : "UTC";

        const hour = hourInTimeZone(now, tz);
        if (!eligibleNow({ hour, startHour, endHour, strictWindow })) continue;

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

      const last = memberships[memberships.length - 1];
      cursor = { createdAt: last.createdAt.toISOString(), id: last.id };
      await setCursor(cursor);

      // If we didn't fill the page, we reached the end; wrap around to ensure
      // subsequent ticks keep scanning from the beginning.
      if (memberships.length < batch) {
        cursor = null;
        await setCursor(cursor);
        looped = true;
      }
    }
  } finally {
    await workerUtils.release();
    await releaseSchedulerLock().catch(() => undefined);
  }
}

export const __test__ = {
  decodeCursor,
  encodeCursor,
  membershipCursorWhere,
  eligibleNow,
};
