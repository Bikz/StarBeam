import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchBytesWithRetry,
  fetchJsonWithRetry,
  HttpError,
} from "../src/lib/integrations/http";

test("fetchJsonWithRetry retries once on 503 and succeeds", async () => {
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return new Response("temporarily unavailable", {
        status: 503,
        headers: { "retry-after": "0" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const json = await fetchJsonWithRetry<{ ok: boolean }>({
      url: "https://example.test/retry",
      init: { method: "GET" },
      label: "retry test",
      maxAttempts: 2,
      timeoutMs: 1_000,
    });
    assert.deepEqual(json, { ok: true });
    assert.equal(calls, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test("fetchBytesWithRetry returns bytes and content-type", async () => {
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = (async () => {
    calls += 1;
    return new Response(Buffer.from("hello-bytes"), {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
  }) as typeof fetch;

  try {
    const out = await fetchBytesWithRetry({
      url: "https://example.test/bytes",
      init: { method: "GET" },
      label: "bytes test",
      maxAttempts: 2,
      timeoutMs: 1_000,
    });
    assert.equal(out.bytes.toString("utf8"), "hello-bytes");
    assert.equal(out.contentType, "application/octet-stream");
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("fetchJsonWithRetry does not retry non-retryable 400", async () => {
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = (async () => {
    calls += 1;
    return new Response("bad request", { status: 400 });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        fetchJsonWithRetry({
          url: "https://example.test/non-retryable",
          init: { method: "GET" },
          label: "non-retryable test",
          maxAttempts: 3,
          timeoutMs: 1_000,
        }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    );
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});
