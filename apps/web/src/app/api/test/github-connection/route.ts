import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@starbeam/db";

import { requireTestEndpoints } from "../_shared";

export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().email(),
  workspaceSlug: z.string().min(1),
  githubLogin: z.string().min(1),
  repoSelectionMode: z.enum(["ALL", "SELECTED"]).default("SELECTED"),
  selectedRepoFullNames: z.array(z.string().min(1)).default(["owner/repo"]),
});

const QuerySchema = z.object({
  id: z.string().min(1),
});

export async function POST(request: Request) {
  const gate = requireTestEndpoints(request);
  if (gate) return gate;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const workspaceSlug = parsed.data.workspaceSlug.trim();

  const [user, workspace] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
      select: { id: true },
    }),
  ]);

  if (!user || !workspace) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, workspaceId: workspace.id },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "not a member" }, { status: 403 });
  }

  const connection = await prisma.gitHubConnection.upsert({
    where: {
      workspaceId_ownerUserId_githubLogin: {
        workspaceId: workspace.id,
        ownerUserId: user.id,
        githubLogin: parsed.data.githubLogin,
      },
    },
    update: {
      tokenEnc: "e2e_token_enc",
      status: "CONNECTED",
      repoSelectionMode: parsed.data.repoSelectionMode,
      selectedRepoFullNames: parsed.data.selectedRepoFullNames,
    },
    create: {
      workspaceId: workspace.id,
      ownerUserId: user.id,
      githubLogin: parsed.data.githubLogin,
      tokenEnc: "e2e_token_enc",
      status: "CONNECTED",
      repoSelectionMode: parsed.data.repoSelectionMode,
      selectedRepoFullNames: parsed.data.selectedRepoFullNames,
    },
    select: {
      id: true,
      githubLogin: true,
      repoSelectionMode: true,
      selectedRepoFullNames: true,
    },
  });

  return NextResponse.json(
    { ok: true, connection },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const gate = requireTestEndpoints(request);
  if (gate) return gate;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    id: url.searchParams.get("id"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const connection = await prisma.gitHubConnection.findUnique({
    where: { id: parsed.data.id },
    select: {
      id: true,
      githubLogin: true,
      repoSelectionMode: true,
      selectedRepoFullNames: true,
    },
  });
  if (!connection) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(
    { ok: true, connection },
    { headers: { "Cache-Control": "no-store" } },
  );
}
