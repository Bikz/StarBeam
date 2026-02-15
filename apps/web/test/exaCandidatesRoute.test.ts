import assert from "node:assert/strict";
import test from "node:test";

import { handleExaCandidatesRequest } from "../src/app/api/onboarding/exa-candidates/route";
import { RateLimitError } from "../src/lib/rateLimit";

type Deps = Parameters<typeof handleExaCandidatesRequest>[1];

type ExaCandidate = { url: string; title: string; snippet: string };
type OkBody = { ok: true; query: string; candidates: ExaCandidate[] };
type ErrBody = { ok: false; error: string };
type Body = OkBody | ErrBody;

type PrismaPick = Deps["prisma"];

function makeReq(workspaceSlug = "personal-abc") {
  return new Request(
    `http://localhost:3000/api/onboarding/exa-candidates?workspaceSlug=${encodeURIComponent(
      workspaceSlug,
    )}`,
    {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    },
  );
}

function baseDeps() {
  const prismaStub = {
    membership: {
      findFirst: async () => ({ workspace: { id: "ws_1" } }),
    },
    user: {
      findUnique: async () => ({ name: "Test User" }),
    },
    workspaceMemberProfile: {
      findUnique: async () => ({
        fullName: "Test User",
        location: "San Francisco",
        jobTitle: "Software engineer",
        company: "Acme",
        companyUrl: "https://acme.example",
      }),
    },
  } as unknown as PrismaPick;

  return {
    getSession: async () => ({ user: { id: "usr_1" } }),
    prisma: prismaStub,
    consumeRateLimit: async () => ({ count: 1 }),
    webOrigin: () => "http://localhost:3000",
    fetchImpl: async () =>
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    exaApiKey: "exa_test_key",
  } as const;
}

test("exa-candidates: auth required", async () => {
  const resp = await handleExaCandidatesRequest(makeReq(), {
    ...baseDeps(),
    getSession: async () => null,
  });

  assert.equal(resp.status, 401);
  const body = (await resp.json()) as Body;
  if (body.ok !== false) throw new Error("expected ok=false");
  assert.equal(body.error, "Unauthorized");
});

test("exa-candidates: missing EXA_API_KEY returns exa_not_configured", async () => {
  const resp = await handleExaCandidatesRequest(makeReq(), {
    ...baseDeps(),
    exaApiKey: "",
    fetchImpl: async () => {
      throw new Error("fetch should not be called when EXA is not configured");
    },
  });

  assert.equal(resp.status, 503);
  const body = (await resp.json()) as Body;
  if (body.ok !== false) throw new Error("expected ok=false");
  assert.equal(body.error, "exa_not_configured");
});

test("exa-candidates: rate limit triggers 429", async () => {
  const resp = await handleExaCandidatesRequest(makeReq(), {
    ...baseDeps(),
    consumeRateLimit: async () => {
      throw new RateLimitError();
    },
  });

  assert.equal(resp.status, 429);
  const body = (await resp.json()) as Body;
  if (body.ok !== false) throw new Error("expected ok=false");
  assert.equal(body.error, "Too many requests");
});

test("exa-candidates: response is trimmed to 3 candidates", async () => {
  const resp = await handleExaCandidatesRequest(makeReq(), {
    ...baseDeps(),
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              url: "https://www.linkedin.com/in/test-user",
              title: "Test User | LinkedIn",
              highlights: ["Engineer at Acme"],
            },
            {
              url: "https://example.com",
              title: "",
              highlights: ["Personal site"],
            },
            {
              url: "https://example.com",
              title: "Duplicate",
              highlights: ["Duplicate"],
            },
            {
              url: "https://github.com/test-user",
              title: "test-user (GitHub)",
              highlights: ["Projects"],
            },
            {
              url: "https://medium.com/@test-user",
              title: "Test User on Medium",
              highlights: ["Writing"],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });

  assert.equal(resp.status, 200);
  const body = (await resp.json()) as Body;
  if (body.ok !== true) throw new Error("expected ok=true");
  assert.ok(body.query.includes("Test User"));

  assert.equal(body.candidates.length, 3);

  const c0 = body.candidates[0]!;
  const c1 = body.candidates[1]!;
  const c2 = body.candidates[2]!;

  assert.equal(c0.url, "https://www.linkedin.com/in/test-user");
  assert.equal(c0.snippet, "Engineer at Acme");

  assert.equal(c1.url, "https://example.com");
  assert.equal(c1.title, "example.com");

  assert.equal(c2.url, "https://github.com/test-user");
});
