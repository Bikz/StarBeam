import { prisma } from "@starbeam/db";
import {
  decryptStringWithAnyKey,
  parseAes256GcmDecryptKeysFromEnv,
} from "@starbeam/shared";

import { fetchJsonWithRetry, HttpError } from "./http";

type LinearGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type LinearIssue = {
  id: string;
  identifier?: string;
  title?: string;
  description?: string | null;
  url?: string;
  updatedAt?: string;
  createdAt?: string;
  state?: { name?: string; type?: string };
  team?: { name?: string; key?: string };
  project?: { name?: string };
};

type LinearAssignedIssuesData = {
  viewer?: {
    id?: string;
    assignedIssues?: {
      nodes?: LinearIssue[];
    };
  };
};

function decryptKeys(): Buffer[] {
  return parseAes256GcmDecryptKeysFromEnv(
    "STARB_TOKEN_ENC_KEY_B64",
    "STARB_TOKEN_ENC_KEY_B64_FALLBACK",
  );
}

function decryptToken(enc: string): string {
  return decryptStringWithAnyKey(enc, decryptKeys());
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

async function linearGraphql<T>(args: {
  token: string;
  query: string;
  variables?: Record<string, unknown>;
  label: string;
}): Promise<T> {
  const parsed = await fetchJsonWithRetry<LinearGraphqlResponse<T>>({
    url: "https://api.linear.app/graphql",
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: args.query,
        variables: args.variables ?? {},
      }),
      cache: "no-store",
    },
    label: args.label,
  });

  if (Array.isArray(parsed.errors) && parsed.errors.length) {
    const msg = parsed.errors[0]?.message ?? "Linear request failed.";
    throw new Error(msg);
  }

  if (!parsed.data) throw new Error("Linear response missing data.");
  return parsed.data;
}

export async function syncLinearConnection(args: {
  workspaceId: string;
  userId: string;
  connectionId: string;
}): Promise<{ ingested: number }> {
  const connection = await prisma.linearConnection.findUnique({
    where: { id: args.connectionId },
  });
  if (!connection) throw new Error("Linear connection not found");
  if (
    connection.workspaceId !== args.workspaceId ||
    connection.ownerUserId !== args.userId
  ) {
    throw new Error("Linear connection workspace/user mismatch");
  }

  const token = decryptToken(connection.tokenEnc);

  const query = `
    query AssignedIssues($first: Int!) {
      viewer {
        id
        assignedIssues(first: $first, orderBy: updatedAt) {
          nodes {
            id
            identifier
            title
            description
            url
            updatedAt
            createdAt
            state { name type }
            team { name key }
            project { name }
          }
        }
      }
    }
  `;

  const data = await linearGraphql<LinearAssignedIssuesData>({
    token,
    query,
    variables: { first: 50 },
    label: "Linear assigned issues",
  });

  const issues = data.viewer?.assignedIssues?.nodes ?? [];

  let ingested = 0;
  for (const it of issues) {
    const externalId = typeof it.id === "string" ? it.id : "";
    if (!externalId) continue;

    const occurredAt =
      parseDate(it.updatedAt) ?? parseDate(it.createdAt) ?? new Date();

    const identifier =
      typeof it.identifier === "string" ? it.identifier.trim() : "";
    const titleBase = (it.title ?? "").trim() || "(untitled)";
    const title = identifier ? `${identifier} ${titleBase}` : titleBase;

    const url = typeof it.url === "string" ? it.url : null;
    const snippet = toSnippet(it.description);
    const contentText =
      typeof it.description === "string"
        ? it.description.trim().slice(0, 50_000)
        : null;

    const metadata = {
      identifier: identifier || null,
      state: it.state?.name ?? null,
      stateType: it.state?.type ?? null,
      team: it.team?.name ?? null,
      teamKey: it.team?.key ?? null,
      project: it.project?.name ?? null,
    };

    await prisma.sourceItem.upsert({
      where: {
        workspaceId_ownerUserId_type_externalId: {
          workspaceId: args.workspaceId,
          ownerUserId: args.userId,
          type: "LINEAR_ISSUE",
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
          url,
          identifier: identifier || null,
          title: titleBase,
          updatedAt: it.updatedAt ?? null,
        },
      },
      create: {
        workspaceId: args.workspaceId,
        ownerUserId: args.userId,
        connectionId: null,
        type: "LINEAR_ISSUE",
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
          url,
          identifier: identifier || null,
          title: titleBase,
          updatedAt: it.updatedAt ?? null,
        },
      },
    });

    ingested += 1;
  }

  await prisma.linearConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt: new Date(), status: "CONNECTED" },
  });

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await prisma.sourceItem.deleteMany({
    where: {
      workspaceId: args.workspaceId,
      ownerUserId: args.userId,
      type: "LINEAR_ISSUE",
      occurredAt: { lt: cutoff },
    },
  });

  return { ingested };
}

export function isAuthRevoked(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 401 || err.status === 403;
  if (!(err instanceof Error)) return false;
  const msg = err.message.trim().toLowerCase();
  return msg.includes("authentication") || msg.includes("unauthorized");
}
