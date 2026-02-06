import crypto from "node:crypto";

import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { decryptBytes, encryptBytes, parseAes256GcmKeyFromEnv } from "@starbeam/shared";

type BlobStoreEnv = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

function sha256Hex(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function envOrEmpty(env: NodeJS.ProcessEnv, name: string): string {
  return (env[name] ?? "").trim();
}

function blobStoreEnvFromProcessEnv(env: NodeJS.ProcessEnv = process.env): BlobStoreEnv | null {
  const endpoint = envOrEmpty(env, "S3_ENDPOINT");
  const region = envOrEmpty(env, "S3_REGION") || "us-east-1";
  const accessKeyId = envOrEmpty(env, "S3_ACCESS_KEY_ID");
  const secretAccessKey = envOrEmpty(env, "S3_SECRET_ACCESS_KEY");
  const bucket = envOrEmpty(env, "S3_BUCKET");

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;

  return { endpoint, region, accessKeyId, secretAccessKey, bucket };
}

function makeS3Client(env: BlobStoreEnv): S3Client {
  return new S3Client({
    region: env.region,
    endpoint: env.endpoint,
    // MinIO requires path-style; R2 supports it.
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });
}

let cached: { env: BlobStoreEnv; client: S3Client; bucketEnsured: boolean } | null = null;

function getBlobStore(): { env: BlobStoreEnv; client: S3Client; bucketEnsured: boolean } | null {
  if (cached) return cached;
  const env = blobStoreEnvFromProcessEnv();
  if (!env) return null;
  cached = { env, client: makeS3Client(env), bucketEnsured: false };
  return cached;
}

export async function ensureBucketExistsIfConfigured(): Promise<void> {
  const store = getBlobStore();
  if (!store) return;
  if (store.bucketEnsured) return;

  const bucket = store.env.bucket;
  try {
    await store.client.send(new HeadBucketCommand({ Bucket: bucket }));
    store.bucketEnsured = true;
    return;
  } catch {
    // Fallthrough to create.
  }

  try {
    await store.client.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch {
    // If it already exists (or we lack perms in hosted), ignore.
  }

  store.bucketEnsured = true;
}

export async function putEncryptedObject(args: {
  key: string;
  contentType?: string;
  plaintext: Buffer;
}): Promise<{
  bucket: string;
  key: string;
  sizeBytes: number;
  sha256: string;
  encryption: "AES_256_GCM_V1";
}> {
  const store = getBlobStore();
  if (!store) throw new Error("S3 blob store not configured");

  const sha256 = sha256Hex(args.plaintext);
  const keyBytes = parseAes256GcmKeyFromEnv();
  const ciphertext = encryptBytes(args.plaintext, keyBytes);

  await ensureBucketExistsIfConfigured();

  const metadata: Record<string, string> = {
    "sb-enc": "AES_256_GCM_V1",
    "sb-plaintext-sha256": sha256,
  };
  if (args.contentType) metadata["sb-content-type"] = args.contentType;

  await store.client.send(
    new PutObjectCommand({
      Bucket: store.env.bucket,
      Key: args.key,
      Body: ciphertext,
      ContentType: "application/octet-stream",
      Metadata: metadata,
      CacheControl: "no-store",
    }),
  );

  return {
    bucket: store.env.bucket,
    key: args.key,
    sizeBytes: args.plaintext.byteLength,
    sha256,
    encryption: "AES_256_GCM_V1",
  };
}

async function s3BodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);

  const anyBody = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof anyBody?.transformToByteArray === "function") {
    const bytes = await anyBody.transformToByteArray();
    return Buffer.from(bytes);
  }

  const asyncIt = (body as { [Symbol.asyncIterator]?: unknown })?.[Symbol.asyncIterator];
  if (typeof asyncIt === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<unknown>) {
      if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk));
      } else if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      } else {
        chunks.push(Buffer.from(String(chunk)));
      }
    }
    return Buffer.concat(chunks);
  }

  throw new Error("Unsupported S3 response body type");
}

export async function getDecryptedObject(args: {
  bucket?: string;
  key: string;
}): Promise<{ plaintext: Buffer }> {
  const store = getBlobStore();
  if (!store) throw new Error("S3 blob store not configured");

  const bucket = args.bucket ?? store.env.bucket;
  const resp = await store.client.send(
    new GetObjectCommand({ Bucket: bucket, Key: args.key }),
  );

  const ciphertext = await s3BodyToBuffer(resp.Body);
  const keyBytes = parseAes256GcmKeyFromEnv();
  const plaintext = decryptBytes(ciphertext, keyBytes);

  return { plaintext };
}
