import { prisma } from "@starbeam/db";
import {
  lastActiveUpdateCutoff,
  shouldUpdateLastActiveAt,
} from "@starbeam/shared";
import { NextResponse } from "next/server";

import { parseAccessToken, sha256Hex } from "@/lib/apiTokens";

type Citation = { url: string; title?: string };

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

  const pulse = (edition?.cards ?? []).slice(0, 7).map((c) => ({
    id: c.id,
    kind: c.kind,
    icon: iconForCardKind(c.kind),
    title: c.title,
    body: c.body || c.action || c.why || "",
    why: c.why || null,
    action: c.action || null,
    sources: extractCitations(c.sources),
  }));

  const [tasks, completedTasks, events] = await Promise.all([
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
        updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      include: { sourceItem: true },
      orderBy: [{ updatedAt: "desc" }],
      take: 10,
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
  ]);
  await touchMembership;

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

  const focus = [
    ...manual.slice(0, 3),
    ...derived.slice(0, Math.max(0, 5 - Math.min(3, manual.length))),
  ]
    .slice(0, 5)
    .map(focusItem);

  const completedFocus = completedTasks.slice(0, 5).map((t) => ({
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

  return NextResponse.json(
    {
      workspace: {
        id: membership.workspace.id,
        name: membership.workspace.name,
        slug: membership.workspace.slug,
      },
      bumpMessage: null,
      pulse,
      focus,
      completedFocus,
      calendar,
      generatedAt: now,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
