import { prisma } from "@starbeam/db";
import { NextResponse } from "next/server";

import { parseAccessToken, sha256Hex } from "@/lib/apiTokens";

function iconForCardKind(kind: string): string | undefined {
  if (kind === "ANNOUNCEMENT") return "🔔";
  if (kind === "GOAL") return "⭐️";
  if (kind === "WEB_RESEARCH") return "🚀";
  return "💡";
}

function iconForFocusSource(type: string | null | undefined): string | undefined {
  if (type === "GMAIL_MESSAGE") return "sf:envelope";
  if (type === "CALENDAR_EVENT") return "sf:calendar";
  return "sf:checkmark.circle";
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function userIdFromRefreshToken(request: Request): Promise<string | null> {
  const refreshToken = (request.headers.get("x-starbeam-refresh-token") ?? "").trim();
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

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspace_id") ?? "";
  if (!workspaceId) {
    return NextResponse.json(
      { error: "invalid_request", errorDescription: "Missing workspace_id" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const membership = await prisma.membership.findFirst({
    where: { workspaceId, userId },
    include: { workspace: true },
  });
  if (!membership) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const edition = await prisma.pulseEdition.findFirst({
    where: { workspaceId, userId },
    orderBy: { editionDate: "desc" },
    include: {
      cards: { orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: 12 },
    },
  });

  const pulse = (edition?.cards ?? []).slice(0, 7).map((c) => ({
    id: c.id,
    icon: iconForCardKind(c.kind),
    title: c.title,
    body: c.body || c.action || c.why || "",
  }));

  const now = new Date();
  const [tasks, events] = await Promise.all([
    prisma.task.findMany({
      where: {
        workspaceId,
        userId,
        status: "OPEN",
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
      },
      include: { sourceItem: true },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
    }),
    prisma.sourceItem.findMany({
      where: {
        workspaceId,
        ownerUserId: userId,
        type: "CALENDAR_EVENT",
        occurredAt: { gte: now, lt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      },
      orderBy: { occurredAt: "asc" },
      take: 10,
    }),
  ]);

  const focus = tasks
    .slice()
    .sort((a, b) => {
      const ad = a.dueAt ? a.dueAt.getTime() : Number.POSITIVE_INFINITY;
      const bd = b.dueAt ? b.dueAt.getTime() : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(0, 5)
    .map((t) => {
      const srcType = t.sourceItem?.type ?? null;
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
    });

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
      calendar,
      generatedAt: now,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
