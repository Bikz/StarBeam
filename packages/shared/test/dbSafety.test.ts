import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSafeDatabaseUrl,
  databaseHostFromUrl,
  isLocalDatabaseHost,
  isLocalDatabaseUrl,
} from "../src/dbSafety";

test("dbSafety: extracts host from postgres URL", () => {
  const host = databaseHostFromUrl(
    "postgresql://starbeam:starbeam@localhost:5435/starbeam",
  );
  assert.equal(host, "localhost");
});

test("dbSafety: identifies local hosts", () => {
  assert.equal(isLocalDatabaseHost("localhost"), true);
  assert.equal(isLocalDatabaseHost("127.0.0.1"), true);
  assert.equal(isLocalDatabaseHost("::1"), true);
  assert.equal(isLocalDatabaseHost("postgres"), true);
  assert.equal(isLocalDatabaseHost("ep-falling-base.neon.tech"), false);
});

test("dbSafety: identifies local URLs", () => {
  assert.equal(
    isLocalDatabaseUrl(
      "postgresql://starbeam:starbeam@localhost:5435/starbeam",
    ),
    true,
  );
  assert.equal(
    isLocalDatabaseUrl(
      "postgresql://starbeam:starbeam@127.0.0.1:5435/starbeam",
    ),
    true,
  );
  assert.equal(
    isLocalDatabaseUrl(
      "postgresql://user:pass@ep-falling-base-aiz6x9xd.neon.tech/neondb",
    ),
    false,
  );
});

test("dbSafety: allows remote URL in production", () => {
  assert.doesNotThrow(() =>
    assertSafeDatabaseUrl({
      databaseUrl: "postgresql://user:pass@ep-falling-base.neon.tech/neondb",
      nodeEnv: "production",
      source: "test",
    }),
  );
});

test("dbSafety: allows remote URL with explicit override", () => {
  assert.doesNotThrow(() =>
    assertSafeDatabaseUrl({
      databaseUrl: "postgresql://user:pass@ep-falling-base.neon.tech/neondb",
      nodeEnv: "development",
      allowRemote: "1",
      source: "test",
    }),
  );
});

test("dbSafety: blocks remote URL by default in non-production", () => {
  assert.throws(
    () =>
      assertSafeDatabaseUrl({
        databaseUrl: "postgresql://user:pass@ep-falling-base.neon.tech/neondb",
        nodeEnv: "development",
        source: "test",
      }),
    /STARB_ALLOW_REMOTE_DB=1/,
  );
});
