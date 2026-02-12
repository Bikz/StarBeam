import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchGitHubViewer,
  fetchLinearViewer,
  fetchNotionBot,
} from "../src/app/(portal)/w/[slug]/integrations/providerCheck";
import { friendlyProviderError } from "../src/app/(portal)/w/[slug]/integrations/providerErrors";

function withMockFetch(
  fn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  const prev = globalThis.fetch;
  globalThis.fetch = fn;
  return () => {
    globalThis.fetch = prev;
  };
}

test("fetchGitHubViewer: returns unauthorized on 401", async () => {
  const restore = withMockFetch(async () => {
    return new Response(JSON.stringify({ message: "Bad credentials" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  });
  try {
    const res = await fetchGitHubViewer("bad");
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("expected error");
    assert.equal(res.code, "unauthorized");
    assert.equal(res.status, 401);
    assert.match(friendlyProviderError("github", res), /didn’t accept/);
  } finally {
    restore();
  }
});

test("fetchGitHubViewer: returns login on 200", async () => {
  const restore = withMockFetch(async () => {
    return new Response(JSON.stringify({ login: "octocat" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  try {
    const res = await fetchGitHubViewer("good");
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("expected ok");
    assert.equal(res.value.login, "octocat");
  } finally {
    restore();
  }
});

test("fetchLinearViewer: returns unauthorized when GraphQL returns errors", async () => {
  const restore = withMockFetch(async () => {
    return new Response(JSON.stringify({ errors: [{ message: "No auth" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  try {
    const res = await fetchLinearViewer("bad");
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("expected error");
    assert.equal(res.code, "unauthorized");
    assert.match(friendlyProviderError("linear", res), /Create a new token/);
  } finally {
    restore();
  }
});

test("fetchLinearViewer: returns unknown when GraphQL error is non-auth", async () => {
  const restore = withMockFetch(async () => {
    return new Response(
      JSON.stringify({ errors: [{ message: "Rate limit exceeded" }] }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  });
  try {
    const res = await fetchLinearViewer("limited");
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("expected error");
    assert.equal(res.code, "unknown");
  } finally {
    restore();
  }
});

test("fetchNotionBot: returns invalid when response is missing bot id", async () => {
  const restore = withMockFetch(async () => {
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  try {
    const res = await fetchNotionBot("weird");
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("expected error");
    assert.equal(res.code, "invalid");
    assert.match(friendlyProviderError("notion", res), /unexpected response/);
  } finally {
    restore();
  }
});
