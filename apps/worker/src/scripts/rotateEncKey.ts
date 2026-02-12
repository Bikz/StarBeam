import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { prisma } from "@starbeam/db";
import {
  decryptBytes,
  decryptBytesWithAnyKey,
  decryptString,
  decryptStringWithAnyKey,
  encryptBytes,
  encryptString,
  parseAes256GcmDecryptKeysFromEnv,
  parseAes256GcmKeyFromEnv,
} from "@starbeam/shared";

type Mode = "dry-run" | "apply";

type RotationCounters = {
  scanned: number;
  alreadyPrimary: number;
  needsRotation: number;
  rotated: number;
  failed: number;
};

function isTruthyEnv(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes((value ?? "").trim().toLowerCase());
}

function findUp(filename: string, startDir: string): string | undefined {
  let dir = startDir;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function loadEnvFromRepoRoot(): void {
  const envLocalPath = findUp(".env.local", process.cwd());
  if (envLocalPath) dotenv.config({ path: envLocalPath });

  const envPath = findUp(".env", process.cwd());
  if (envPath) dotenv.config({ path: envPath });
}

function modeFromArgv(argv: string[]): Mode {
  const hasApply = argv.includes("--apply");
  const hasDryRun = argv.includes("--dry-run");
  if (hasApply && hasDryRun) {
    throw new Error("Use either --apply or --dry-run, not both.");
  }
  return hasApply ? "apply" : "dry-run";
}

function emptyCounters(): RotationCounters {
  return {
    scanned: 0,
    alreadyPrimary: 0,
    needsRotation: 0,
    rotated: 0,
    failed: 0,
  };
}

function rotateTokenCiphertext(args: {
  ciphertext: string;
  primaryKey: Buffer;
  decryptKeys: readonly Buffer[];
}): { alreadyPrimary: boolean; reencrypted?: string } {
  try {
    decryptString(args.ciphertext, args.primaryKey);
    return { alreadyPrimary: true };
  } catch {
    const plaintext = decryptStringWithAnyKey(
      args.ciphertext,
      args.decryptKeys,
    );
    return {
      alreadyPrimary: false,
      reencrypted: encryptString(plaintext, args.primaryKey),
    };
  }
}

async function rotateGoogleTokens(args: {
  mode: Mode;
  primaryKey: Buffer;
  decryptKeys: readonly Buffer[];
}): Promise<RotationCounters> {
  const counters = emptyCounters();
  const rows = await prisma.googleConnection.findMany({
    select: { id: true, accessTokenEnc: true, refreshTokenEnc: true },
  });

  for (const row of rows) {
    const updates: { accessTokenEnc?: string; refreshTokenEnc?: string } = {};
    const fields = [
      { label: "accessTokenEnc", value: row.accessTokenEnc },
      { label: "refreshTokenEnc", value: row.refreshTokenEnc },
    ];

    for (const field of fields) {
      if (!field.value) continue;
      counters.scanned += 1;
      try {
        const rotated = rotateTokenCiphertext({
          ciphertext: field.value,
          primaryKey: args.primaryKey,
          decryptKeys: args.decryptKeys,
        });
        if (rotated.alreadyPrimary) {
          counters.alreadyPrimary += 1;
          continue;
        }
        counters.needsRotation += 1;
        if (args.mode === "apply" && rotated.reencrypted) {
          if (field.label === "accessTokenEnc") {
            updates.accessTokenEnc = rotated.reencrypted;
          } else {
            updates.refreshTokenEnc = rotated.reencrypted;
          }
          counters.rotated += 1;
        }
      } catch (err) {
        counters.failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error(
          `[rotate:enc-key] googleConnection:${row.id} ${field.label} failed: ${message}`,
        );
      }
    }

    if (args.mode === "apply" && Object.keys(updates).length > 0) {
      await prisma.googleConnection.update({
        where: { id: row.id },
        data: updates,
      });
    }
  }

  return counters;
}

async function rotateGitHubTokens(args: {
  mode: Mode;
  primaryKey: Buffer;
  decryptKeys: readonly Buffer[];
}): Promise<RotationCounters> {
  const counters = emptyCounters();
  const rows = await prisma.gitHubConnection.findMany({
    select: { id: true, tokenEnc: true },
  });

  for (const row of rows) {
    counters.scanned += 1;
    try {
      const rotated = rotateTokenCiphertext({
        ciphertext: row.tokenEnc,
        primaryKey: args.primaryKey,
        decryptKeys: args.decryptKeys,
      });
      if (rotated.alreadyPrimary) {
        counters.alreadyPrimary += 1;
        continue;
      }
      counters.needsRotation += 1;
      if (args.mode === "apply" && rotated.reencrypted) {
        await prisma.gitHubConnection.update({
          where: { id: row.id },
          data: { tokenEnc: rotated.reencrypted },
        });
        counters.rotated += 1;
      }
    } catch (err) {
      counters.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(
        `[rotate:enc-key] gitHubConnection:${row.id} tokenEnc failed: ${message}`,
      );
    }
  }

  return counters;
}

async function rotateLinearTokens(args: {
  mode: Mode;
  primaryKey: Buffer;
  decryptKeys: readonly Buffer[];
}): Promise<RotationCounters> {
  const counters = emptyCounters();
  const rows = await prisma.linearConnection.findMany({
    select: { id: true, tokenEnc: true },
  });

  for (const row of rows) {
    counters.scanned += 1;
    try {
      const rotated = rotateTokenCiphertext({
        ciphertext: row.tokenEnc,
        primaryKey: args.primaryKey,
        decryptKeys: args.decryptKeys,
      });
      if (rotated.alreadyPrimary) {
        counters.alreadyPrimary += 1;
        continue;
      }
      counters.needsRotation += 1;
      if (args.mode === "apply" && rotated.reencrypted) {
        await prisma.linearConnection.update({
          where: { id: row.id },
          data: { tokenEnc: rotated.reencrypted },
        });
        counters.rotated += 1;
      }
    } catch (err) {
      counters.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(
        `[rotate:enc-key] linearConnection:${row.id} tokenEnc failed: ${message}`,
      );
    }
  }

  return counters;
}

async function rotateNotionTokens(args: {
  mode: Mode;
  primaryKey: Buffer;
  decryptKeys: readonly Buffer[];
}): Promise<RotationCounters> {
  const counters = emptyCounters();
  const rows = await prisma.notionConnection.findMany({
    select: { id: true, tokenEnc: true },
  });

  for (const row of rows) {
    counters.scanned += 1;
    try {
      const rotated = rotateTokenCiphertext({
        ciphertext: row.tokenEnc,
        primaryKey: args.primaryKey,
        decryptKeys: args.decryptKeys,
      });
      if (rotated.alreadyPrimary) {
        counters.alreadyPrimary += 1;
        continue;
      }
      counters.needsRotation += 1;
      if (args.mode === "apply" && rotated.reencrypted) {
        await prisma.notionConnection.update({
          where: { id: row.id },
          data: { tokenEnc: rotated.reencrypted },
        });
        counters.rotated += 1;
      }
    } catch (err) {
      counters.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(
        `[rotate:enc-key] notionConnection:${row.id} tokenEnc failed: ${message}`,
      );
    }
  }

  return counters;
}

type BlobStoreEnv = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function envOrEmpty(name: string): string {
  return (process.env[name] ?? "").trim();
}

function blobStoreEnv(): BlobStoreEnv | null {
  const endpoint = envOrEmpty("S3_ENDPOINT");
  const accessKeyId = envOrEmpty("S3_ACCESS_KEY_ID");
  const secretAccessKey = envOrEmpty("S3_SECRET_ACCESS_KEY");
  const region = envOrEmpty("S3_REGION") || "us-east-1";
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, region, accessKeyId, secretAccessKey };
}

function makeS3Client(env: BlobStoreEnv): S3Client {
  return new S3Client({
    region: env.region,
    endpoint: env.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });
}

async function s3BodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);

  const anyBody = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof anyBody.transformToByteArray === "function") {
    const bytes = await anyBody.transformToByteArray();
    return Buffer.from(bytes);
  }

  const asyncIt = (body as { [Symbol.asyncIterator]?: unknown })[
    Symbol.asyncIterator
  ];
  if (typeof asyncIt === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<unknown>) {
      if (typeof chunk === "string") chunks.push(Buffer.from(chunk));
      else if (chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk));
      else chunks.push(Buffer.from(String(chunk)));
    }
    return Buffer.concat(chunks);
  }

  throw new Error("Unsupported S3 response body type");
}

async function rotateBlobs(args: {
  mode: Mode;
  primaryKey: Buffer;
  decryptKeys: readonly Buffer[];
}): Promise<RotationCounters> {
  const counters = emptyCounters();
  const env = blobStoreEnv();
  if (!env) {
    // eslint-disable-next-line no-console
    console.warn(
      "[rotate:enc-key] blob store env missing (S3_ENDPOINT/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY). Skipping blob rotation.",
    );
    return counters;
  }

  const s3 = makeS3Client(env);
  const blobs = await prisma.blob.findMany({
    where: { deletedAt: null },
    select: { id: true, bucket: true, key: true },
  });

  for (const blob of blobs) {
    counters.scanned += 1;
    try {
      const resp = await s3.send(
        new GetObjectCommand({ Bucket: blob.bucket, Key: blob.key }),
      );
      const ciphertext = await s3BodyToBuffer(resp.Body);

      try {
        decryptBytes(ciphertext, args.primaryKey);
        counters.alreadyPrimary += 1;
        continue;
      } catch {
        // Fall through to multi-key decrypt.
      }

      const plaintext = decryptBytesWithAnyKey(ciphertext, args.decryptKeys);
      counters.needsRotation += 1;
      if (args.mode === "apply") {
        const reencrypted = encryptBytes(plaintext, args.primaryKey);
        await s3.send(
          new PutObjectCommand({
            Bucket: blob.bucket,
            Key: blob.key,
            Body: reencrypted,
            ContentType: resp.ContentType ?? "application/octet-stream",
            CacheControl: resp.CacheControl ?? "no-store",
            Metadata: {
              ...(resp.Metadata ?? {}),
              "sb-enc": "AES_256_GCM_V1",
            },
          }),
        );
        counters.rotated += 1;
      }
    } catch (err) {
      counters.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(
        `[rotate:enc-key] blob:${blob.id} (${blob.bucket}/${blob.key}) failed: ${message}`,
      );
    }
  }

  return counters;
}

function printCounters(label: string, counters: RotationCounters): void {
  // eslint-disable-next-line no-console
  console.log(`[rotate:enc-key] ${label}`, counters);
}

async function main(): Promise<void> {
  loadEnvFromRepoRoot();

  const mode = modeFromArgv(process.argv.slice(2));
  const primaryKey = parseAes256GcmKeyFromEnv("STARB_TOKEN_ENC_KEY_B64");
  const decryptKeys = parseAes256GcmDecryptKeysFromEnv(
    "STARB_TOKEN_ENC_KEY_B64",
    "STARB_TOKEN_ENC_KEY_B64_FALLBACK",
  );

  if (
    !process.env.DATABASE_URL &&
    !isTruthyEnv(process.env.STARB_ALLOW_REMOTE_DB)
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      "[rotate:enc-key] DATABASE_URL is not set in process env. Prisma may fail to initialize.",
    );
  }

  // eslint-disable-next-line no-console
  console.log("[rotate:enc-key] starting", {
    mode,
    decryptKeyCount: decryptKeys.length,
    hasFallbackKey: decryptKeys.length > 1,
  });

  const google = await rotateGoogleTokens({ mode, primaryKey, decryptKeys });
  const github = await rotateGitHubTokens({ mode, primaryKey, decryptKeys });
  const linear = await rotateLinearTokens({ mode, primaryKey, decryptKeys });
  const notion = await rotateNotionTokens({ mode, primaryKey, decryptKeys });
  const blobs = await rotateBlobs({ mode, primaryKey, decryptKeys });

  printCounters("googleConnection", google);
  printCounters("gitHubConnection", github);
  printCounters("linearConnection", linear);
  printCounters("notionConnection", notion);
  printCounters("blobs", blobs);

  const failed =
    google.failed +
    github.failed +
    linear.failed +
    notion.failed +
    blobs.failed;

  if (mode === "dry-run") {
    // eslint-disable-next-line no-console
    console.log(
      "[rotate:enc-key] dry-run complete. Re-run with --apply to perform writes.",
    );
  } else {
    // eslint-disable-next-line no-console
    console.log("[rotate:enc-key] apply complete.");
  }

  if (failed > 0) {
    throw new Error(`[rotate:enc-key] completed with ${failed} failures.`);
  }
}

await main()
  .catch((err) => {
    const message =
      err instanceof Error ? (err.stack ?? err.message) : String(err);
    // eslint-disable-next-line no-console
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
