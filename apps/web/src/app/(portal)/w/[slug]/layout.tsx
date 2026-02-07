import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import { requireBetaAccessOrRedirect } from "@/lib/betaAccess";
import AppShell from "@/components/app-shell";

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
