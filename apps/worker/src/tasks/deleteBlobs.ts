import { z } from "zod";

import { deleteObjectBestEffort } from "../lib/blobStore";

const DeleteBlobsPayloadSchema = z.object({
  blobs: z
    .array(
      z.object({
        bucket: z.string().min(1).optional(),
        key: z.string().min(1),
      }),
    )
    .max(500),
});

// Background deletion of blob-store objects (R2/MinIO). This is invoked from
// web disconnect flows, since the web service doesn't have S3 credentials.
export async function delete_blobs(payload: unknown): Promise<void> {
  const parsed = DeleteBlobsPayloadSchema.safeParse(payload);
  if (!parsed.success) throw new Error("Invalid delete_blobs payload");

  for (const b of parsed.data.blobs) {
    await deleteObjectBestEffort({ bucket: b.bucket, key: b.key });
  }
}
