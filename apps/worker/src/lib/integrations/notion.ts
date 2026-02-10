import { prisma } from "@starbeam/db";
import { decryptString, parseAes256GcmKeyFromEnv } from "@starbeam/shared";

import { fetchJson, HttpError } from "./http";

type NotionSearchResponse = {
  results?: unknown[];
  next_cursor?: string | null;
  has_more?: boolean;
};

type NotionPage = {
  object?: string;
  id?: string;
  url?: string;
  created_time?: string;
  last_edited_time?: string;
  archived?: boolean;
  properties?: Record<string, unknown>;
};

type NotionBlockChildrenResponse = {
  results?: unknown[];
  next_cursor?: string | null;
  has_more?: boolean;
};

function encKey(): Buffer {
  return parseAes256GcmKeyFromEnv("STARB_TOKEN_ENC_KEY_B64");
}

function decryptToken(enc: string): string {
  return decryptString(enc, encKey());
}

function toSnippet(
  text: string | null | undefined,
  maxLen = 280,
): string | null {
  if (typeof text !== "string") return null;
  const t = text.trim();
  if (!t) return null;
  return t.slice(0, maxLen);
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function normalizeNotionId(id: string): string {
  return id.replaceAll("-", "");
}

function extractNotionPageTitle(page: NotionPage): string {
  const props = page.properties ?? {};
  for (const v of Object.values(props)) {
    const anyProp = v as { type?: unknown; title?: unknown };
    if (anyProp?.type !== "title") continue;
    const title = anyProp.title;
    if (!Array.isArray(title)) continue;
    const parts = title
      .map((t) => {
        const rt = t as { plain_text?: unknown };
        return typeof rt.plain_text === "string" ? rt.plain_text : "";
      })
      .filter(Boolean);
    const joined = parts.join("").trim();
    if (joined) return joined;
  }

  return "(untitled)";
}

function richTextToPlainText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((rt) => {
      const r = rt as { plain_text?: unknown };
      return typeof r.plain_text === "string" ? r.plain_text : "";
    })
    .join("")
    .trim();
}

function extractBlockPlainText(block: unknown): string {
  if (!block || typeof block !== "object") return "";
  const b = block as { type?: unknown } & Record<string, unknown>;
  const type = typeof b.type === "string" ? b.type : "";
  if (!type) return "";

  const payload = b[type] as
    | { rich_text?: unknown; text?: unknown }
    | undefined;
  const rich = payload?.rich_text ?? payload?.text;
  return richTextToPlainText(rich);
}

async function notionRequest<T>(args: {
  token: string;
  url: string;
  init: RequestInit;
  label: string;
}): Promise<T> {
  const init = {
    ...args.init,
    headers: {
      ...(args.init.headers ?? {}),
      Authorization: `Bearer ${args.token}`,
      "Notion-Version": "2022-06-28",
    },
    cache: "no-store" as const,
  } satisfies RequestInit;

  return fetchJson<T>({ url: args.url, init, label: args.label });
}

async function searchPages(args: {
  token: string;
  pageSize: number;
}): Promise<NotionPage[]> {
  const body = JSON.stringify({
    page_size: args.pageSize,
    sort: { direction: "descending", timestamp: "last_edited_time" },
    filter: { value: "page", property: "object" },
  });

  const resp = await notionRequest<NotionSearchResponse>({
    token: args.token,
    url: "https://api.notion.com/v1/search",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    },
    label: "Notion search",
  });

  const results = Array.isArray(resp.results) ? resp.results : [];
  return results
    .map((r) => r as NotionPage)
    .filter((p) => p.object === "page" && typeof p.id === "string");
}

async function fetchPageText(args: {
  token: string;
  pageId: string;
  maxChars: number;
}): Promise<string | null> {
  let cursor: string | null = null;
  let collected = "";

  for (let page = 0; page < 2; page += 1) {
    const params = new URLSearchParams({ page_size: "100" });
    if (cursor) params.set("start_cursor", cursor);

    const url = `https://api.notion.com/v1/blocks/${normalizeNotionId(args.pageId)}/children?${params.toString()}`;

    const resp = await notionRequest<NotionBlockChildrenResponse>({
      token: args.token,
      url,
      init: { method: "GET" },
      label: "Notion blocks",
    });

    const blocks = Array.isArray(resp.results) ? resp.results : [];

    for (const b of blocks) {
      const line = extractBlockPlainText(b);
      if (!line) continue;

      if (collected) collected += "\n";
      collected += line;

      if (collected.length >= args.maxChars) {
        collected = collected.slice(0, args.maxChars);
        return collected;
      }
    }

    cursor = typeof resp.next_cursor === "string" ? resp.next_cursor : null;
    const hasMore = Boolean(resp.has_more);
    if (!hasMore || !cursor) break;
  }

  const trimmed = collected.trim();
  return trimmed ? trimmed : null;
}

export async function syncNotionConnection(args: {
  workspaceId: string;
  userId: string;
  connectionId: string;
}): Promise<{ ingested: number }> {
  const connection = await prisma.notionConnection.findUnique({
    where: { id: args.connectionId },
  });
  if (!connection) throw new Error("Notion connection not found");
  if (
    connection.workspaceId !== args.workspaceId ||
    connection.ownerUserId !== args.userId
  ) {
    throw new Error("Notion connection workspace/user mismatch");
  }

  const token = decryptToken(connection.tokenEnc);

  const pages = await searchPages({ token, pageSize: 20 });

  let ingested = 0;
  for (const [idx, p] of pages.entries()) {
    const externalId = typeof p.id === "string" ? p.id : "";
    if (!externalId) continue;
    if (p.archived) continue;

    const occurredAt =
      parseDate(p.last_edited_time) ?? parseDate(p.created_time) ?? new Date();

    const title = extractNotionPageTitle(p);
    const url = typeof p.url === "string" ? p.url : null;

    // Fetch page blocks for a small subset only (avoid rate spikes); store a light
    // excerpt for relevance. Full Notion export is a later iteration.
    let contentText: string | null = null;
    if (idx < 8) {
      try {
        contentText = await fetchPageText({
          token,
          pageId: externalId,
          maxChars: 12_000,
        });
      } catch {
        contentText = null;
      }
    }

    const snippet = toSnippet(contentText);

    const metadata = {
      notionWorkspaceName: connection.notionWorkspaceName ?? null,
      lastEditedTime: p.last_edited_time ?? null,
    };

    await prisma.sourceItem.upsert({
      where: {
        workspaceId_ownerUserId_type_externalId: {
          workspaceId: args.workspaceId,
          ownerUserId: args.userId,
          type: "NOTION_PAGE",
          externalId,
        },
      },
      update: {
        url,
        title,
        snippet,
        contentText,
        occurredAt,
        endsAt: null,
        metadata,
        raw: {
          id: externalId,
          url,
          last_edited_time: p.last_edited_time ?? null,
        },
      },
      create: {
        workspaceId: args.workspaceId,
        ownerUserId: args.userId,
        connectionId: null,
        type: "NOTION_PAGE",
        externalId,
        url,
        title,
        snippet,
        contentText,
        occurredAt,
        endsAt: null,
        metadata,
        raw: {
          id: externalId,
          url,
          last_edited_time: p.last_edited_time ?? null,
        },
      },
    });

    ingested += 1;
  }

  await prisma.notionConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt: new Date(), status: "CONNECTED" },
  });

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await prisma.sourceItem.deleteMany({
    where: {
      workspaceId: args.workspaceId,
      ownerUserId: args.userId,
      type: "NOTION_PAGE",
      occurredAt: { lt: cutoff },
    },
  });

  return { ingested };
}

export function isAuthRevoked(err: unknown): boolean {
  return err instanceof HttpError && (err.status === 401 || err.status === 403);
}
