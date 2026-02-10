import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";
import {
  lastActiveUpdateCutoff,
  shouldUpdateLastActiveAt,
} from "@starbeam/shared";

import { authOptions } from "@/lib/auth";
import { requireBetaAccessOrRedirect } from "@/lib/betaAccess";
import AppShell from "@/components/app-shell";

function parseIntEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");
  await requireBetaAccessOrRedirect(session.user.id);

  const { slug } = await params;
  const cookieStore = await cookies();
  const ref = cookieStore.get("sb_ref")?.value ?? "";
  if (ref) {
    redirect(`/beta/claim?next=${encodeURIComponent(`/w/${slug}`)}`);
  }

  const [membership, memberships] = await Promise.all([
    prisma.membership.findFirst({
      where: { userId: session.user.id, workspace: { slug } },
      include: { workspace: true },
    }),
    prisma.membership.findMany({
      where: { userId: session.user.id },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!membership) notFound();

  const now = new Date();
  const throttleMins = parseIntEnv("STARB_ACTIVE_UPDATE_THROTTLE_MINS", 60);
  if (
    shouldUpdateLastActiveAt({
      lastActiveAt: membership.lastActiveAt,
      now,
      throttleMins,
    })
  ) {
    const cutoff = lastActiveUpdateCutoff(now, throttleMins);
    await prisma.membership
      .updateMany({
        where: {
          id: membership.id,
          OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: cutoff } }],
        },
        data: { lastActiveAt: now },
      })
      .catch(() => undefined);
  }

  return (
    <AppShell
      user={{ email: session.user.email ?? "unknown" }}
      workspaces={memberships.map((m) => ({
        slug: m.workspace.slug,
        name: m.workspace.name,
        type: m.workspace.type,
        role: m.role,
      }))}
      activeWorkspace={{
        slug: membership.workspace.slug,
        name: membership.workspace.name,
        role: membership.role,
      }}
    >
      {children}
    </AppShell>
  );
}
