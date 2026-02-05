import { prisma } from "@starbeam/db";

import { fetchMessageMetadata, headerValue, listMessageRefs } from "./gmail";
import { eventEnd, eventStart, listPrimaryEvents } from "./calendar";
import {
  decryptToken,
  encryptToken,
  isExpired,
  refreshGoogleAccessToken,
} from "./oauth";

function isNoiseSender(fromHeader: string): boolean {
  const s = fromHeader.toLowerCase();
  return (
    s.includes("no-reply") ||
    s.includes("noreply") ||
    s.includes("notifications@") ||
    s.includes("do-not-reply") ||
    s.includes("mailer-daemon")
  );
}

function isActionableSubject(subject: string): boolean {
  const s = subject.toLowerCase();
  if (!s.trim()) return false;
  if (s.includes("newsletter")) return false;
  if (s.includes("digest")) return false;
  if (s.includes("receipt")) return false;
  return true;
}

function extractFromDomain(fromHeader: string): string | null {
  const at = fromHeader.lastIndexOf("@");
  if (at === -1) return null;
  const domain = fromHeader.slice(at + 1).replaceAll(/[>\s"].*$/g, "").trim();
  if (!domain) return null;
  return domain.toLowerCase();
}

export async function syncGoogleConnection(args: {
  workspaceId: string;
  userId: string;
  connectionId: string;
}): Promise<{ gmailIngested: number; calendarIngested: number }> {
  const connection = await prisma.googleConnection.findUnique({
    where: { id: args.connectionId },
    include: { syncState: true },
  });
  if (!connection) throw new Error("Google connection not found");
  if (connection.workspaceId !== args.workspaceId || connection.ownerUserId !== args.userId) {
    throw new Error("Google connection workspace/user mismatch");
  }

  // Decrypt tokens (STARB_TOKEN_ENC_KEY_B64 required).
  let accessToken = decryptToken(connection.accessTokenEnc);
  const refreshToken = connection.refreshTokenEnc
    ? decryptToken(connection.refreshTokenEnc)
    : null;

  // Refresh access token if expired/missing.
  if (isExpired(connection.expiryAt)) {
    if (!refreshToken) throw new Error("Google refresh token missing; reconnect required");
    const refreshed = await refreshGoogleAccessToken(refreshToken);
    accessToken = refreshed.accessToken;

    const expiryAt =
      typeof refreshed.expiresIn === "number"
        ? new Date(Date.now() + refreshed.expiresIn * 1000)
        : null;

    const accessTokenEnc = encryptToken(accessToken);
    const scopes =
      typeof refreshed.scope === "string" && refreshed.scope.trim()
        ? refreshed.scope.trim().split(/\s+/g)
        : connection.scopes;

    await prisma.googleConnection.update({
      where: { id: connection.id },
      data: {
        accessTokenEnc,
        expiryAt,
        scopes,
        status: "CONNECTED",
      },
    });
  }

  // Gmail: last 24h (cap 50 for now).
  const afterUnix = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
  const refs = await listMessageRefs({
    accessToken,
    afterUnixSeconds: afterUnix,
    maxResults: 50,
  });

  const messages = [];
  for (const r of refs) {
    const msg = await fetchMessageMetadata({ accessToken, messageId: r.id });
    messages.push(msg);
  }

  const gmailData = messages
    .map((m) => {
      const externalId = typeof m.id === "string" ? m.id : "";
      if (!externalId) return null;

      const subject = headerValue(m, "Subject").trim() || "(no subject)";
      const from = headerValue(m, "From").trim();
      const fromDomain = extractFromDomain(from);
      const isUnread = Array.isArray(m.labelIds) ? m.labelIds.includes("UNREAD") : false;

      const internalDateMs = typeof m.internalDate === "string" ? Number(m.internalDate) : NaN;
      const occurredAt = Number.isFinite(internalDateMs) ? new Date(internalDateMs) : new Date();

      const threadId = typeof m.threadId === "string" ? m.threadId : undefined;
      const url = threadId
        ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(threadId)}`
        : undefined;

      const metadata = {
        threadId,
        fromDomain,
        isUnread,
        noise: isNoiseSender(from) || !isActionableSubject(subject),
      };

      return {
        workspaceId: args.workspaceId,
        ownerUserId: args.userId,
        connectionId: connection.id,
        type: "GMAIL_MESSAGE" as const,
        externalId,
        url,
        title: subject,
        snippet: null,
        contentText: null,
        occurredAt,
        endsAt: null,
        metadata,
        raw: null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (gmailData.length) {
    await prisma.sourceItem.createMany({ data: gmailData, skipDuplicates: true });
  }

  // Calendar: now -> next 7 days (cap 50).
  const timeMin = new Date();
  const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const events = await listPrimaryEvents({
    accessToken,
    timeMin,
    timeMax,
    maxResults: 50,
  });

  const calendarData = events
    .map((e) => {
      const externalId = typeof e.id === "string" ? e.id : "";
      if (!externalId) return null;

      const start = eventStart(e);
      if (!start) return null;

      const end = eventEnd(e);
      const title = (typeof e.summary === "string" && e.summary.trim()) ? e.summary.trim() : "(untitled event)";
      const url = typeof e.htmlLink === "string" ? e.htmlLink : undefined;

      const metadata = {
        status: e.status,
      };

      return {
        workspaceId: args.workspaceId,
        ownerUserId: args.userId,
        connectionId: connection.id,
        type: "CALENDAR_EVENT" as const,
        externalId,
        url,
        title,
        snippet: null,
        contentText: null,
        occurredAt: start,
        endsAt: end,
        metadata,
        raw: null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (calendarData.length) {
    await prisma.sourceItem.createMany({ data: calendarData, skipDuplicates: true });
  }

  await prisma.googleSyncState.upsert({
    where: { connectionId: connection.id },
    update: {
      lastGmailSyncAt: new Date(),
      lastCalendarSyncAt: new Date(),
    },
    create: {
      connectionId: connection.id,
      lastGmailSyncAt: new Date(),
      lastCalendarSyncAt: new Date(),
    },
  });

  // Retention: keep only 30 days of source items (no raw content stored).
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await prisma.sourceItem.deleteMany({
    where: {
      workspaceId: args.workspaceId,
      ownerUserId: args.userId,
      connectionId: connection.id,
      occurredAt: { lt: cutoff },
    },
  });

  return { gmailIngested: gmailData.length, calendarIngested: calendarData.length };
}

export async function generateFocusTasks(args: {
  workspaceId: string;
  userId: string;
}): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const now = new Date();

  // Rebuild today's derived tasks, but keep any tasks the user already completed.
  await prisma.task.deleteMany({
    where: {
      workspaceId: args.workspaceId,
      userId: args.userId,
      status: "OPEN",
      sourceItemId: { not: null },
      createdAt: { gte: since },
    },
  });

  const emails = await prisma.sourceItem.findMany({
    where: {
      workspaceId: args.workspaceId,
      ownerUserId: args.userId,
      type: "GMAIL_MESSAGE",
      occurredAt: { gte: since },
    },
    orderBy: { occurredAt: "desc" },
    take: 60,
  });

  const actionableEmails = emails
    .filter((e) => {
      const meta = e.metadata as { noise?: unknown } | null;
      if (meta && typeof meta.noise === "boolean" && meta.noise) return false;
      return true;
    })
    .slice(0, 3);

  const events = await prisma.sourceItem.findMany({
    where: {
      workspaceId: args.workspaceId,
      ownerUserId: args.userId,
      type: "CALENDAR_EVENT",
      occurredAt: { gte: now, lt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    },
    orderBy: { occurredAt: "asc" },
    take: 10,
  });

  const upcoming = events.slice(0, 2);

  const tasks = [
    ...actionableEmails.map((e) => ({
      workspaceId: args.workspaceId,
      userId: args.userId,
      sourceItemId: e.id,
      title: `Follow up: ${e.title}`,
      body: "",
      status: "OPEN" as const,
      dueAt: null,
      snoozedUntil: null,
    })),
    ...upcoming.map((e) => ({
      workspaceId: args.workspaceId,
      userId: args.userId,
      sourceItemId: e.id,
      title: `Prep: ${e.title}`,
      body: "",
      status: "OPEN" as const,
      dueAt: e.occurredAt,
      snoozedUntil: null,
    })),
  ];

  if (!tasks.length) return 0;

  const created = await prisma.task.createMany({ data: tasks, skipDuplicates: true });
  return created.count;
}
