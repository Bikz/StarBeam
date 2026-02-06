import { prisma } from "@starbeam/db";
import { decryptString, parseAes256GcmKeyFromEnv } from "@starbeam/shared";

import { fetchJson, HttpError } from "./http";

type GitHubIssue = {
  id: number;
  title?: string;
  body?: string | null;
  html_url?: string;
  number?: number;
  state?: string;
  created_at?: string;
  updated_at?: string;
  repository?: { full_name?: string };
  pull_request?: unknown;
};

function encKey(): Buffer {
  return parseAes256GcmKeyFromEnv("STARB_TOKEN_ENC_KEY_B64");
}

function decryptToken(enc: string): string {
  return decryptString(enc, encKey());
}

function toSnippet(text: string | null | undefined, maxLen = 280): string | null {
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

async function listIssues(args: {
  token: string;
  filter: "assigned" | "mentioned" | "created";
  sinceIso?: string;
  perPage?: number;
}): Promise<GitHubIssue[]> {
  const params = new URLSearchParams({
    filter: args.filter,
    state: "open",
    sort: "updated",
    direction: "desc",
    per_page: String(args.perPage ?? 50),
  });
  if (args.sinceIso) params.set("since", args.sinceIso);

  const url = `https://api.github.com/issues?${params.toString()}`;

  return fetchJson<GitHubIssue[]>({
    url,
    init: {
      method: "GET",
      headers: {
        Authorization: `Bearer ${args.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Starbeam",
      },
      cache: "no-store",
    },
    label: `GitHub list issues (${args.filter})`,
  });
}

export async function syncGitHubConnection(args: {
  workspaceId: string;
  userId: string;
  connectionId: string;
}): Promise<{ ingested: number }> {
  const connection = await prisma.gitHubConnection.findUnique({
    where: { id: args.connectionId },
  });
  if (!connection) throw new Error("GitHub connection not found");
  if (connection.workspaceId !== args.workspaceId || connection.ownerUserId !== args.userId) {
    throw new Error("GitHub connection workspace/user mismatch");
  }

  const token = decryptToken(connection.tokenEnc);
  const since = connection.lastSyncedAt ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();

  // Keep it simple: pull the top recent items across a few "attention routing" filters.
  const filters: Array<"assigned" | "mentioned" | "created"> = [
    "assigned",
    "mentioned",
    "created",
  ];

  const byId = new Map<number, GitHubIssue>();
  for (const f of filters) {
    const list = await listIssues({ token, filter: f, sinceIso, perPage: 50 });
    for (const it of list) {
      if (typeof it?.id === "number") byId.set(it.id, it);
    }
  }

  const items = Array.from(byId.values());

  let ingested = 0;
  for (const it of items) {
    const externalId = typeof it.id === "number" ? String(it.id) : "";
    if (!externalId) continue;

    const isPr = Boolean(it.pull_request);
    const type = isPr ? ("GITHUB_PULL_REQUEST" as const) : ("GITHUB_ISSUE" as const);

    const occurredAt =
      parseDate(it.updated_at) ?? parseDate(it.created_at) ?? new Date();

    const repo = it.repository?.full_name?.trim() ?? "";
    const titleBase = (it.title ?? "").trim() || "(untitled)";
    const title = repo ? `[${repo}] ${titleBase}` : titleBase;

    const url = typeof it.html_url === "string" ? it.html_url : null;
    const snippet = toSnippet(it.body);
    const contentText = typeof it.body === "string" ? it.body.trim().slice(0, 50_000) : null;

    const metadata = {
      repoFullName: repo || null,
      number: typeof it.number === "number" ? it.number : null,
      state: typeof it.state === "string" ? it.state : null,
      isPullRequest: isPr,
    };

    await prisma.sourceItem.upsert({
      where: {
        workspaceId_ownerUserId_type_externalId: {
          workspaceId: args.workspaceId,
          ownerUserId: args.userId,
          type,
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
          id: it.id,
          html_url: url,
          title: titleBase,
          repoFullName: repo || null,
          updated_at: it.updated_at ?? null,
        },
      },
      create: {
        workspaceId: args.workspaceId,
        ownerUserId: args.userId,
        connectionId: null,
        type,
        externalId,
        url,
        title,
        snippet,
        contentText,
        occurredAt,
        endsAt: null,
        metadata,
        raw: {
          id: it.id,
          html_url: url,
          title: titleBase,
          repoFullName: repo || null,
          updated_at: it.updated_at ?? null,
        },
      },
    });

    ingested += 1;
  }

  await prisma.gitHubConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt: new Date(), status: "CONNECTED" },
  });

  // Retention: keep only 30 days of items.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await prisma.sourceItem.deleteMany({
    where: {
      workspaceId: args.workspaceId,
      ownerUserId: args.userId,
      type: { in: ["GITHUB_ISSUE", "GITHUB_PULL_REQUEST"] },
      occurredAt: { lt: cutoff },
    },
  });

  return { ingested };
}

export function isAuthRevoked(err: unknown): boolean {
  return err instanceof HttpError && (err.status === 401 || err.status === 403);
}

