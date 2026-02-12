import assert from "node:assert/strict";
import test from "node:test";

import { makeWorkerUtils } from "graphile-worker";

type PgClient = {
  query: (
    queryText: string,
    values?: unknown[],
  ) => Promise<{ rows: Array<{ ok?: unknown }> }>;
};

const LOCK_KEY_A = 8011;
const LOCK_KEY_B = 41027;

function hasDatabaseUrl(): boolean {
  return (
    typeof process.env.DATABASE_URL === "string" &&
    process.env.DATABASE_URL.length > 0
  );
}

test(
  "scheduler advisory lock can be acquired and released across sessions",
  { skip: !hasDatabaseUrl() },
  async () => {
    const connectionString = process.env.DATABASE_URL ?? "";

    const utilsA = await makeWorkerUtils({ connectionString });
    const utilsB = await makeWorkerUtils({ connectionString });

    try {
      await utilsA.withPgClient(async (clientAraw) => {
        const clientA = clientAraw as unknown as PgClient;

        const acquired = await clientA
          .query("select pg_try_advisory_lock($1::int, $2::int) as ok", [
            LOCK_KEY_A,
            LOCK_KEY_B,
          ])
          .then((res) => Boolean(res.rows?.[0]?.ok));
        assert.equal(acquired, true);

        const otherAcquired = await utilsB.withPgClient(async (clientBraw) => {
          const clientB = clientBraw as unknown as PgClient;
          const ok = await clientB
            .query("select pg_try_advisory_lock($1::int, $2::int) as ok", [
              LOCK_KEY_A,
              LOCK_KEY_B,
            ])
            .then((res) => Boolean(res.rows?.[0]?.ok));
          if (ok) {
            await clientB.query("select pg_advisory_unlock($1::int, $2::int)", [
              LOCK_KEY_A,
              LOCK_KEY_B,
            ]);
          }
          return ok;
        });
        assert.equal(otherAcquired, false);

        await clientA.query("select pg_advisory_unlock($1::int, $2::int)", [
          LOCK_KEY_A,
          LOCK_KEY_B,
        ]);

        const afterRelease = await utilsB.withPgClient(async (clientBraw) => {
          const clientB = clientBraw as unknown as PgClient;
          const ok = await clientB
            .query("select pg_try_advisory_lock($1::int, $2::int) as ok", [
              LOCK_KEY_A,
              LOCK_KEY_B,
            ])
            .then((res) => Boolean(res.rows?.[0]?.ok));
          if (ok) {
            await clientB.query("select pg_advisory_unlock($1::int, $2::int)", [
              LOCK_KEY_A,
              LOCK_KEY_B,
            ]);
          }
          return ok;
        });

        assert.equal(afterRelease, true);
      });
    } finally {
      await utilsA.release();
      await utilsB.release();
    }
  },
);
