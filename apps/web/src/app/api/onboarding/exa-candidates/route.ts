import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import { consumeRateLimit, RateLimitError } from "@/lib/rateLimit";
import { webOrigin } from "@/lib/webOrigin";

const QuerySchema = z.object({
  workspaceSlug: z.string().min(1).max(191),
});

function isSameOrigin(req: Request, expectedOrigin: string): boolean {
  const origin = (req.headers.get("origin") ?? "").trim();
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}

function hasText(value: string | null | undefined): boolean {
  return Boolean((value ?? "").trim());
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

function buildPeopleQuery(args: {
  fullName: string;
  location?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  companyUrl?: string | null;
}): string {
  const parts = [
    args.fullName,
    args.jobTitle ?? "",
    args.company ?? "",
    args.location ?? "",
    args.companyUrl ?? "",
    "LinkedIn",
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.join(" ").trim();
}

type ExaSearchResponse = {
  results?: Array<{
    url?: unknown;
    title?: unknown;
    highlights?: unknown;
  }>;
};

export type ExaCandidate = {
  url: string;
  title: string;
  snippet: string;
};

type ExaCandidatesDeps = {
  getSession: () => Promise<{ user?: { id?: string | null } | null } | null>;
  prisma: Pick<typeof prisma, "membership" | "user" | "workspaceMemberProfile">;
  consumeRateLimit: typeof consumeRateLimit;
  webOrigin: () => string;
  fetchImpl: typeof fetch;
  exaApiKey?: string | null | undefined;
};

export async function handleExaCandidatesRequest(
  req: Request,
  deps: ExaCandidatesDeps,
) {
  if (!isSameOrigin(req, deps.webOrigin())) {
    return NextResponse.json(
      { ok: false, error: "Forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const session = await deps.getSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(req.url);
  const qs = QuerySchema.safeParse({
    workspaceSlug: url.searchParams.get("workspaceSlug") ?? "",
  });
  if (!qs.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid workspaceSlug" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const membership = await deps.prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      workspace: { slug: qs.data.workspaceSlug },
    },
    include: { workspace: true },
  });
  if (!membership) {
    return NextResponse.json(
      { ok: false, error: "Not a member" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    await deps.consumeRateLimit({
      key: `exa_candidates:user:${session.user.id}:workspace:${membership.workspace.id}`,
      windowSec: 5 * 60,
      limit: Number(process.env.STARB_EXA_CANDIDATES_LIMIT_5M ?? "10") || 10,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { ok: false, error: "Too many requests" },
        { status: 429, headers: { "Cache-Control": "no-store" } },
      );
    }
    throw err;
  }

  const exaKey = (deps.exaApiKey ?? process.env.EXA_API_KEY ?? "").trim();
  if (!exaKey) {
    return NextResponse.json(
      { ok: false, error: "exa_not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const [user, profile] = await Promise.all([
    deps.prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    }),
    deps.prisma.workspaceMemberProfile.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: membership.workspace.id,
          userId: session.user.id,
        },
      },
      select: {
        fullName: true,
        location: true,
        jobTitle: true,
        company: true,
        companyUrl: true,
      },
    }),
  ]);

  const fullName = (profile?.fullName ?? user?.name ?? "").trim();
  if (!hasText(fullName)) {
    return NextResponse.json(
      { ok: false, error: "missing_name" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const query = buildPeopleQuery({
    fullName,
    location: profile?.location ?? null,
    jobTitle: profile?.jobTitle ?? null,
    company: profile?.company ?? null,
    companyUrl: profile?.companyUrl ?? null,
  });

  let parsed: ExaSearchResponse | null = null;
  try {
    const resp = await deps.fetchImpl("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": exaKey,
      },
      body: JSON.stringify({
        query,
        numResults: 6,
        category: "people",
        contents: { highlights: true },
      }),
      cache: "no-store",
    });

    const text = await resp.text();
    if (!resp.ok) {
      return NextResponse.json(
        { ok: false, error: `exa_failed:${resp.status}` },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    parsed = JSON.parse(text) as ExaSearchResponse;
  } catch {
    return NextResponse.json(
      { ok: false, error: "exa_failed" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  const results = Array.isArray(parsed?.results) ? (parsed?.results ?? []) : [];
  const seen = new Set<string>();

  const candidates = results
    .map((r) => {
      const url = typeof r.url === "string" ? r.url.trim() : "";
      const title = typeof r.title === "string" ? r.title.trim() : "";
      const highlights = Array.isArray(r.highlights) ? r.highlights : [];
      const snippet =
        typeof highlights[0] === "string" ? String(highlights[0]).trim() : "";

      return {
        url,
        title: title || hostLabel(url),
        snippet,
      };
    })
    .filter((c) => hasText(c.url))
    .filter((c) => {
      if (seen.has(c.url)) return false;
      seen.add(c.url);
      return true;
    })
    .slice(0, 3);

  return NextResponse.json(
    { ok: true, query, candidates },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  return handleExaCandidatesRequest(req, {
    getSession: () => getServerSession(authOptions),
    prisma,
    consumeRateLimit,
    webOrigin,
    fetchImpl: fetch,
  });
}
