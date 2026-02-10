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

export async function materializeWorkspaceContextForCodex(args: {
  workspace: WorkspaceSummary;
  profile: WorkspaceProfileSummary;
  goals: GoalSummary[];
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
    take: 250,
  });

  const blobsDir = path.join(dir, "blobs");
  await fs.mkdir(blobsDir, { recursive: true });

  const blobPathBySourceItemId = new Map<string, string>();
  const maxFileBytes = 10 * 1024 * 1024;
  const maxTotalBytes = 30 * 1024 * 1024;
  let downloadedBytes = 0;
  let downloadedCount = 0;

  for (const si of sourceItems) {
    if (!si.contentBlob) continue;
    if (downloadedCount >= 12) break;
    if (si.contentBlob.sizeBytes > maxFileBytes) continue;
    if (downloadedBytes + si.contentBlob.sizeBytes > maxTotalBytes) break;

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
        ? si.contentText.trim().slice(0, 12_000)
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
      "- `profile.json`",
      "- `departments.json` (only departments the user belongs to)",
      "- `goals.json`",
      "- `source-items.jsonl` (recent signals; last 24h after memory is established, otherwise last 7 days)",
      "- `blobs/` (optional decrypted file snapshots, if blob store is configured)",
      "- `memory/` (optional; durable journal + base summary from previous days)",
      "",
    ].join("\n"),
    "utf8",
  );

  return { dir, cleanup, departmentNameToId };
}
