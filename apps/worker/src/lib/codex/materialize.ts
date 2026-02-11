import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { prisma } from "@starbeam/db";

import { getDecryptedObject } from "../blobStore";

type WorkspaceSummary = { id: string; name: string; slug: string };

type WorkspaceProfileSummary = {
  websiteUrl?: string | null;
  description?: string | null;
  competitorDomains?: string[] | null;
} | null;

type GoalSummary = {
  id: string;
  title: string;
  body?: string | null;
  priority: string;
  departmentId?: string | null;
};

type PersonalProfileSummary = {
  jobTitle?: string | null;
  about?: string | null;
} | null;

type PersonalGoalSummary = {
  id: string;
  title: string;
  body?: string | null;
  active: boolean;
  targetWindow?: string | null;
};

type TaskSummary = {
  id: string;
  title: string;
  body?: string | null;
  status: string;
  dueAt?: Date | null;
  snoozedUntil?: Date | null;
  updatedAt: Date;
  sourceItem?: {
    id: string;
    type: string;
    title: string;
    url?: string | null;
  } | null;
};

type DepartmentSummary = {
  id: string;
  name: string;
  promptTemplate: string;
  memberships: Array<{ userId: string }>;
};

function extractDateFromKey(key: string): string | null {
  const base = key.split("/").pop() ?? "";
  const m = base.match(/^(\d{4}-\d{2}-\d{2})\./);
  return m?.[1] ?? null;
}

function sanitizeFilename(value: string): string {
  const cleaned = value
    .trim()
    .replaceAll(/[^a-zA-Z0-9._ -]/g, "_")
    .replaceAll(/\s+/g, " ")
    .slice(0, 120);
  return cleaned || "file";
}

function extForContentType(contentType: string | null | undefined): string {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("json")) return ".json";
  if (ct.includes("markdown")) return ".md";
  if (ct.includes("csv")) return ".csv";
  if (ct.startsWith("text/")) return ".txt";
  return ".bin";
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

export async function materializeWorkspaceContextForCodex(args: {
  workspace: WorkspaceSummary;
  profile: WorkspaceProfileSummary;
  goals: GoalSummary[];
  personalProfile?: PersonalProfileSummary;
  personalGoals?: PersonalGoalSummary[];
  tasks?: TaskSummary[];
  departments: DepartmentSummary[];
  userId: string;
}): Promise<{
  dir: string;
  cleanup: () => Promise<void>;
  departmentNameToId: Map<string, string>;
}> {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "starbeam-codex-context-"),
  );

  const cleanup = async () => {
    await fs.rm(dir, { recursive: true, force: true });
  };

  const departmentNameToId = new Map<string, string>();
  for (const d of args.departments) departmentNameToId.set(d.name, d.id);

  const userDepartments = args.departments
    .filter((d) => d.memberships.some((m) => m.userId === args.userId))
    .map((d) => ({ id: d.id, name: d.name, promptTemplate: d.promptTemplate }));

  await Promise.all([
    fs.writeFile(
      path.join(dir, "workspace.json"),
      JSON.stringify(args.workspace, null, 2),
      "utf8",
    ),
    fs.writeFile(
      path.join(dir, "workspace-profile.json"),
      JSON.stringify(args.profile ?? null, null, 2),
      "utf8",
    ),
    fs.writeFile(
      path.join(dir, "personal-profile.json"),
      JSON.stringify(args.personalProfile ?? null, null, 2),
      "utf8",
    ),
    fs.writeFile(
      path.join(dir, "workspace-goals.json"),
      JSON.stringify(args.goals ?? [], null, 2),
      "utf8",
    ),
    fs.writeFile(
      path.join(dir, "personal-goals.json"),
      JSON.stringify(args.personalGoals ?? [], null, 2),
      "utf8",
    ),
    fs.writeFile(
      path.join(dir, "tasks.jsonl"),
      `${(args.tasks ?? [])
        .map((task) =>
          JSON.stringify({
            id: task.id,
            title: task.title,
            body: task.body ?? "",
            status: task.status,
            dueAt: task.dueAt ? task.dueAt.toISOString() : null,
            snoozedUntil: task.snoozedUntil
              ? task.snoozedUntil.toISOString()
              : null,
            updatedAt: task.updatedAt.toISOString(),
            sourceItem: task.sourceItem
              ? {
                  id: task.sourceItem.id,
                  type: task.sourceItem.type,
                  title: task.sourceItem.title,
                  url: task.sourceItem.url ?? null,
                }
              : null,
          }),
        )
        .join("\n")}\n`,
      "utf8",
    ),
    // Legacy aliases retained for compatibility while prompts migrate.
    fs.writeFile(
      path.join(dir, "profile.json"),
      JSON.stringify(args.profile ?? null, null, 2),
      "utf8",
    ),
    fs.writeFile(
      path.join(dir, "goals.json"),
      JSON.stringify(args.goals ?? [], null, 2),
      "utf8",
    ),
    fs.writeFile(
      path.join(dir, "departments.json"),
      JSON.stringify(userDepartments, null, 2),
      "utf8",
    ),
  ]);

  // Codex memory (optional): keep a durable, append-only journal of daily summaries
  // so we can send only deltas after the first run.
  const memoryDir = path.join(dir, "memory");
  await fs.mkdir(path.join(memoryDir, "base"), { recursive: true });
  await fs.mkdir(path.join(memoryDir, "daily"), { recursive: true });

  const memoryPrefix = `workspaces/${args.workspace.id}/users/${args.userId}/codex-memory/`;
  const basePrefix = `${memoryPrefix}base/`;
  const dailyPrefix = `${memoryPrefix}daily/`;

  const [baseBlob, dailyBlobs] = await Promise.all([
    prisma.blob.findFirst({
      where: {
        workspaceId: args.workspace.id,
        ownerUserId: args.userId,
        key: { startsWith: basePrefix },
        deletedAt: null,
      },
      orderBy: { key: "desc" },
      select: { bucket: true, key: true },
    }),
    prisma.blob.findMany({
      where: {
        workspaceId: args.workspace.id,
        ownerUserId: args.userId,
        key: { startsWith: dailyPrefix },
        deletedAt: null,
      },
      orderBy: { key: "desc" },
      take: 14,
      select: { bucket: true, key: true },
    }),
  ]);

  if (baseBlob) {
    try {
      const { plaintext } = await getDecryptedObject({
        bucket: baseBlob.bucket,
        key: baseBlob.key,
      });
      const date = extractDateFromKey(baseBlob.key) ?? "latest";
      await fs.writeFile(path.join(memoryDir, "base", `${date}.md`), plaintext);
    } catch {
      // If blob store isn't configured (or the object is missing), proceed without memory.
    }
  }

  for (const b of dailyBlobs) {
    try {
      const { plaintext } = await getDecryptedObject({
        bucket: b.bucket,
        key: b.key,
      });
      const date = extractDateFromKey(b.key);
      if (!date) continue;
      await fs.writeFile(
        path.join(memoryDir, "daily", `${date}.md`),
        plaintext,
      );
    } catch {
      // Ignore missing/unreadable memory blobs.
    }
  }

  const cutoff = baseBlob
    ? new Date(Date.now() - 24 * 60 * 60 * 1000)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const maxSourceItems = Math.min(
    1000,
    Math.max(1, parseIntEnv("STARB_CODEX_MAX_SOURCE_ITEMS", 150)),
  );
  const maxContentTextChars = Math.min(
    50_000,
    Math.max(0, parseIntEnv("STARB_CODEX_MAX_CONTENT_TEXT_CHARS", 6000)),
  );
  const maxBlobCount = Math.min(
    50,
    Math.max(0, parseIntEnv("STARB_CODEX_MAX_BLOB_COUNT", 6)),
  );
  const maxBlobFileBytes = Math.min(
    50 * 1024 * 1024,
    Math.max(0, parseIntEnv("STARB_CODEX_MAX_BLOB_FILE_BYTES", 5_242_880)),
  );
  const maxBlobTotalBytes = Math.min(
    250 * 1024 * 1024,
    Math.max(0, parseIntEnv("STARB_CODEX_MAX_BLOB_TOTAL_BYTES", 10_485_760)),
  );

  const sourceItems = await prisma.sourceItem.findMany({
    where: {
      workspaceId: args.workspace.id,
      ownerUserId: args.userId,
      occurredAt: { gte: cutoff },
    },
    include: {
      contentBlob: {
        select: {
          bucket: true,
          key: true,
          contentType: true,
          sizeBytes: true,
          sha256: true,
        },
      },
    },
    orderBy: { occurredAt: "desc" },
    take: maxSourceItems,
  });

  const blobsDir = path.join(dir, "blobs");
  await fs.mkdir(blobsDir, { recursive: true });

  const blobPathBySourceItemId = new Map<string, string>();
  let downloadedBytes = 0;
  let downloadedCount = 0;

  for (const si of sourceItems) {
    if (!si.contentBlob) continue;
    if (downloadedCount >= maxBlobCount) break;
    if (si.contentBlob.sizeBytes > maxBlobFileBytes) continue;
    if (downloadedBytes + si.contentBlob.sizeBytes > maxBlobTotalBytes) break;

    try {
      const { plaintext } = await getDecryptedObject({
        bucket: si.contentBlob.bucket,
        key: si.contentBlob.key,
      });

      const ext = extForContentType(si.contentBlob.contentType);
      const base = sanitizeFilename(`${si.type}_${si.externalId}`);
      const filename = `${base}${ext}`;
      const rel = path.join("blobs", filename);
      const abs = path.join(dir, rel);

      await fs.writeFile(abs, plaintext);
      blobPathBySourceItemId.set(si.id, rel);
      downloadedBytes += plaintext.byteLength;
      downloadedCount += 1;
    } catch {
      // If blob store isn't configured or a specific file is missing, continue with DB-only context.
    }
  }

  const sourceItemsPath = path.join(dir, "source-items.jsonl");
  const lines: string[] = [];

  for (const si of sourceItems) {
    const materializedBlobPath = blobPathBySourceItemId.get(si.id) ?? null;
    const contentText =
      typeof si.contentText === "string"
        ? si.contentText.trim().slice(0, maxContentTextChars)
        : null;

    lines.push(
      JSON.stringify({
        id: si.id,
        type: si.type,
        title: si.title,
        url: si.url ?? null,
        occurredAt: si.occurredAt.toISOString(),
        endsAt: si.endsAt ? si.endsAt.toISOString() : null,
        snippet: si.snippet ?? null,
        contentText,
        metadata: si.metadata ?? null,
        raw: si.raw ?? null,
        materializedBlobPath,
      }),
    );
  }

  await fs.writeFile(sourceItemsPath, `${lines.join("\n")}\n`, "utf8");

  await fs.writeFile(
    path.join(dir, "README.md"),
    [
      "# Starbeam Codex Context",
      "",
      "This directory is materialized per-workspace/per-user for a nightly pulse run.",
      "",
      "Files:",
      "- `workspace.json`",
      "- `workspace-profile.json`",
      "- `personal-profile.json`",
      "- `departments.json` (only departments the user belongs to)",
      "- `workspace-goals.json`",
      "- `personal-goals.json`",
      "- `tasks.jsonl`",
      "- `profile.json` / `goals.json` (legacy aliases for compatibility)",
      "- `source-items.jsonl` (recent signals; last 24h after memory is established, otherwise last 7 days)",
      "- `blobs/` (optional decrypted file snapshots, if blob store is configured)",
      "- `memory/` (optional; durable journal + base summary from previous days)",
      "",
    ].join("\n"),
    "utf8",
  );

  return { dir, cleanup, departmentNameToId };
}
