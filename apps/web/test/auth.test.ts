import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";

type ProvidersBuilder = (env: Record<string, string | undefined>) => unknown[];

async function importBuildProvidersFromEnv(): Promise<ProvidersBuilder> {
  const url = new URL("../src/lib/authProviders.ts", import.meta.url);
  // Bust Node's module cache so edits in a dev session are always reflected.
  url.searchParams.set("t", String(Date.now()));

  const mod = (await import(url.href)) as {
    default?: unknown;
    buildProvidersFromEnv?: unknown;
  };

  const direct = mod.buildProvidersFromEnv;
  if (typeof direct === "function") return direct as ProvidersBuilder;

  const def = mod.default;
  if (def && typeof def === "object") {
    const maybe = (def as { buildProvidersFromEnv?: unknown })
      .buildProvidersFromEnv;
    if (typeof maybe === "function") return maybe as ProvidersBuilder;
  }

  throw new Error("buildProvidersFromEnv export not found");
}

test("buildProvidersFromEnv returns no providers when env is missing", async () => {
  const buildProvidersFromEnv = await importBuildProvidersFromEnv();
  const providers = buildProvidersFromEnv({
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
  });
  assert.equal(Array.isArray(providers), true);
  assert.equal(providers.length, 1);
  assert.equal((providers[0] as { id?: unknown })?.id, "credentials");
});

test("buildProvidersFromEnv returns Google provider when env is set", async () => {
  const buildProvidersFromEnv = await importBuildProvidersFromEnv();
  const providers = buildProvidersFromEnv({
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
  });
  assert.equal(Array.isArray(providers), true);
  assert.equal(providers.length, 2);
  assert.equal((providers[0] as { id?: unknown })?.id, "credentials");
});
