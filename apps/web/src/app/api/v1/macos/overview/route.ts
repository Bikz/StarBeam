import { prisma } from "@starbeam/db";
import { NextResponse } from "next/server";

import { parseAccessToken } from "@/lib/apiTokens";

function iconForCardKind(kind: string): string | undefined {
  if (kind === "ANNOUNCEMENT") return "🔔";
  if (kind === "GOAL") return "⭐️";
  if (kind === "WEB_RESEARCH") return "🚀";
  return "💡";
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let userId: string;
  try {
    const payload = parseAccessToken(token);
    userId = payload.sub;
  } catch (err) {
    const code = err instanceof Error ? err.message : "invalid_token";
    return NextResponse.json(
      { error: code },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspace_id") ?? "";
  if (!workspaceId) {
    return NextResponse.json(
      { error: "invalid_request", errorDescription: "Missing workspace_id" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const membership = await prisma.membership.findFirst({
    where: { workspaceId, userId },
    include: { workspace: true },
  });
  if (!membership) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const edition = await prisma.pulseEdition.findFirst({
    where: { workspaceId, userId },
    orderBy: { editionDate: "desc" },
    include: {
      cards: { orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: 12 },
    },
  });

  const pulse = (edition?.cards ?? []).slice(0, 7).map((c) => ({
    id: c.id,
    icon: iconForCardKind(c.kind),
    title: c.title,
    body: c.body || c.action || c.why || "",
  }));

  return NextResponse.json(
    {
      workspace: {
        id: membership.workspace.id,
        name: membership.workspace.name,
        slug: membership.workspace.slug,
      },
      bumpMessage: null,
      pulse,
      focus: [],
      calendar: [],
      generatedAt: new Date(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

