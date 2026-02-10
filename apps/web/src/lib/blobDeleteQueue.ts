import { makeWorkerUtils, runMigrations } from "graphile-worker";

function requireDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL");
  return connectionString;
}

export async function enqueueDeleteBlobs(args: {
  blobs: Array<{ bucket: string; key: string }>;
}): Promise<void> {
  if (args.blobs.length === 0) return;

  const connectionString = requireDatabaseUrl();
  await runMigrations({ connectionString });

  const workerUtils = await makeWorkerUtils({ connectionString });
  try {
    // Best effort; if it fails we still consider the disconnect successful.
    await workerUtils.addJob(
      "delete_blobs",
      { blobs: args.blobs },
      { maxAttempts: 5 },
    );
  } finally {
    await workerUtils.release();
  }
}
