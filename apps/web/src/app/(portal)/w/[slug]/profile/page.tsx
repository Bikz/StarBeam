import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { upsertWorkspaceProfile } from "@/app/(portal)/w/[slug]/profile/actions";
import { authOptions } from "@/lib/auth";

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export default async function WorkspaceProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const [{ slug }, sp] = await Promise.all([params, searchParams]);

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug } },
    include: { workspace: true },
  });
  if (!membership) notFound();

  const manageable = canManage(membership.role);

  const profile = await prisma.workspaceProfile.findUnique({
    where: { workspaceId: membership.workspace.id },
  });

  const saved = Boolean(sp.saved);
  const competitorText = (profile?.competitorDomains ?? []).join("\n");

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="sb-card p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="sb-title text-xl">Company profile</div>
            <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
              This is the shared context Starbeam uses for web research prompts
              and department pulses.
            </p>
          </div>
          {saved ? (
            <div className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-3 py-1 text-[11px] font-semibold text-[color:var(--sb-muted)]">
              Saved
            </div>
          ) : null}
        </div>

        {!manageable ? (
          <div className="mt-5 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-sm text-[color:var(--sb-muted)]">
            Only managers/admins can edit the profile in v0.
          </div>
        ) : null}

        <form
          action={upsertWorkspaceProfile.bind(null, membership.workspace.slug)}
          className="mt-6 grid gap-4"
        >
          <label className="grid gap-1 text-sm">
            <span className="text-[color:var(--sb-muted)]">Website</span>
            <input
              name="websiteUrl"
              type="text"
              placeholder="https://company.com"
              defaultValue={profile?.websiteUrl ?? ""}
              className="h-11 rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-4 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
              readOnly={!manageable}
            />
            <span className="mt-1 text-xs text-[color:var(--sb-muted)]">
              Used for company context (and later: website crawl).
            </span>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-[color:var(--sb-muted)]">Description</span>
            <textarea
              name="description"
              placeholder="What do you do? Who is your customer? What's the current focus?"
              defaultValue={profile?.description ?? ""}
              className="min-h-[140px] rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-4 py-3 text-[13px] leading-relaxed outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
              readOnly={!manageable}
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-[color:var(--sb-muted)]">Competitors (domains)</span>
            <textarea
              name="competitorDomains"
              placeholder={"competitor-a.com\ncompetitor-b.com"}
              defaultValue={competitorText}
              className="min-h-[120px] rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-4 py-3 text-[13px] leading-relaxed outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
              readOnly={!manageable}
            />
            <span className="mt-1 text-xs text-[color:var(--sb-muted)]">
              One per line. Used to scope marketing research queries.
            </span>
          </label>

          <button
            type="submit"
            className="sb-btn h-11 px-5 text-sm font-extrabold"
            disabled={!manageable}
            title={!manageable ? "Managers/Admins only" : undefined}
          >
            Save profile
          </button>
        </form>
      </div>

      <div className="sb-card p-7">
        <div className="sb-title text-xl">What to enter</div>
        <div className="mt-3 grid gap-3 text-sm text-[color:var(--sb-muted)] leading-relaxed">
          <div>
            <span className="font-semibold text-[color:var(--sb-fg)]">
              Website:
            </span>{" "}
            the canonical homepage for your company or project.
          </div>
          <div>
            <span className="font-semibold text-[color:var(--sb-fg)]">
              Description:
            </span>{" "}
            the 3-6 sentences you wish every employee had in their head when
            prioritizing.
          </div>
          <div>
            <span className="font-semibold text-[color:var(--sb-fg)]">
              Competitors:
            </span>{" "}
            domains only (no paths). Starbeam will use this for “what changed in
            the last 72h?” web insight cards.
          </div>
        </div>
      </div>
    </div>
  );
}
