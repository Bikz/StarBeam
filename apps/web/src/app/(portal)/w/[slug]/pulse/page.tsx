import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import PulseReader from "@/components/pulse-reader";

export default async function PulsePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const { slug } = await params;

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug } },
    include: { workspace: true },
  });
  if (!membership) notFound();

  const edition = await prisma.pulseEdition.findFirst({
    where: { workspaceId: membership.workspace.id, userId: session.user.id },
    orderBy: { editionDate: "desc" },
    include: { cards: { orderBy: [{ priority: "desc" }, { createdAt: "asc" }] } },
  });

  if (!edition) {
    return (
      <div className="sb-card p-7">
        <h2 className="sb-title text-xl font-extrabold">No pulse yet</h2>
        <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
          No pulse editions yet for this workspace.
        </p>
        <div className="mt-5 flex gap-3">
          <Link
            href={`/w/${membership.workspace.slug}/jobs`}
            className="sb-btn h-11 px-5 text-sm font-extrabold"
          >
            Run overnight now
          </Link>
          <Link
            href={`/w/${membership.workspace.slug}`}
            className="sb-btn h-11 px-5 text-sm font-extrabold"
          >
            Back to overview
          </Link>
        </div>
      </div>
    );
  }

  return (
    <PulseReader
      workspaceSlug={membership.workspace.slug}
      edition={{
        editionDateIso: edition.editionDate.toISOString(),
        status: edition.status,
      }}
      cards={edition.cards.map((c) => ({
        id: c.id,
        kind: c.kind,
        title: c.title,
        body: c.body,
        why: c.why,
        action: c.action,
        priority: c.priority,
        sources: c.sources,
        createdAt: c.createdAt.toISOString(),
      }))}
    />
  );
}
