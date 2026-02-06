import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";

function kindLabel(kind: string): string {
  if (kind === "ANNOUNCEMENT") return "Announcement";
  if (kind === "GOAL") return "Goal";
  if (kind === "WEB_RESEARCH") return "Web research";
  return "Internal";
}

type Citation = { url: string; title?: string };

function extractCitations(sources: unknown): Citation[] {
  if (!sources || typeof sources !== "object") return [];
  const obj = sources as Record<string, unknown>;
  const citations = obj.citations;
  if (!Array.isArray(citations)) return [];
  return citations
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const cc = c as Record<string, unknown>;
      const url = typeof cc.url === "string" ? cc.url : "";
      const title = typeof cc.title === "string" ? cc.title : undefined;
      if (!url) return null;
      return { url, ...(title ? { title } : {}) } satisfies Citation;
    })
    .filter((c): c is Citation => c !== null);
}

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
        <div className="sb-title text-xl">Pulse</div>
        <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
          No pulse editions yet for this workspace.
        </p>
        <div className="mt-5 flex gap-3">
          <Link
            href={`/w/${membership.workspace.slug}/jobs`}
            className="sb-btn h-11 px-5 text-sm font-extrabold"
          >
            Run nightly job
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
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="sb-card p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="sb-title text-xl">Latest pulse</div>
            <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
              Edition date: {edition.editionDate.toISOString()} | Status:{" "}
              {edition.status.toLowerCase()}
            </div>
          </div>
          <Link
            href={`/w/${membership.workspace.slug}/jobs`}
            className="sb-btn px-4 py-2 text-xs font-semibold"
          >
            Runs
          </Link>
        </div>

        {edition.cards.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-sm text-[color:var(--sb-muted)]">
            This edition has no cards yet.
          </div>
        ) : (
          <div className="mt-6 grid gap-3">
            {edition.cards.map((c) => {
              const citations = extractCitations(c.sources);
              return (
                <div
                  key={c.id}
                  className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="sb-title text-lg leading-tight">
                        {c.title}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                        {kindLabel(c.kind)} | priority {c.priority}
                      </div>
                    </div>
                    <div className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-3 py-1 text-[11px] font-semibold text-[color:var(--sb-muted)]">
                      {c.kind}
                    </div>
                  </div>

                  {c.body ? (
                    <div className="mt-3 text-sm text-[color:var(--sb-muted)] leading-relaxed whitespace-pre-wrap">
                      {c.body}
                    </div>
                  ) : null}

                  {c.why ? (
                    <div className="mt-3 text-sm text-[color:var(--sb-muted)] leading-relaxed whitespace-pre-wrap">
                      <span className="font-semibold text-[color:var(--sb-fg)]">
                        Why:
                      </span>{" "}
                      {c.why}
                    </div>
                  ) : null}

                  {c.action ? (
                    <div className="mt-3 text-sm text-[color:var(--sb-muted)] leading-relaxed whitespace-pre-wrap">
                      <span className="font-semibold text-[color:var(--sb-fg)]">
                        Suggested action:
                      </span>{" "}
                      {c.action}
                    </div>
                  ) : null}

                  {citations.length ? (
                    <div className="mt-4 grid gap-1 text-sm">
                      <div className="text-xs font-semibold text-[color:var(--sb-muted)]">
                        Sources
                      </div>
                      <div className="grid gap-1">
                        {citations.map((s) => (
                          <a
                            key={s.url}
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-[color:var(--sb-fg)] hover:underline"
                            title={s.url}
                          >
                            {s.title ? `${s.title} - ${s.url}` : s.url}
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="sb-card p-7">
        <div className="sb-title text-xl">Notes</div>
        <div className="mt-3 grid gap-3 text-sm text-[color:var(--sb-muted)] leading-relaxed">
          <div>
            This page is a debugging surface for v0 while the macOS menu bar app
            is under construction.
          </div>
          <div>
            Next: tasks, calendar highlights, and per-card regenerate with
            rate-limits.
          </div>
        </div>
      </div>
    </div>
  );
}
