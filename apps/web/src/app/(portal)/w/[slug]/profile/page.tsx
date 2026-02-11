import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import {
  upsertPersonalProfile,
  upsertWorkspaceProfile,
} from "@/app/(portal)/w/[slug]/profile/actions";
import { authOptions } from "@/lib/auth";
import { isContextSplitEnabled } from "@/lib/flags";

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

function LegacyProfileCard(args: {
  manageable: boolean;
  saved: boolean;
  workspaceSlug: string;
  websiteUrl: string;
  description: string;
  competitorText: string;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="sb-card p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="sb-title text-xl">Company profile</h2>
            <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
              This is the shared context Starbeam uses for web research prompts
              and department pulses.
            </p>
          </div>
          {args.saved ? <div className="sb-pill">Saved</div> : null}
        </div>

        {!args.manageable ? (
          <div className="mt-5 sb-alert">
            Only managers/admins can edit the profile in v0.
          </div>
        ) : null}

        <form
          action={upsertWorkspaceProfile.bind(null, args.workspaceSlug)}
          className="mt-6 grid gap-4"
        >
          <label className="grid gap-1 text-sm">
            <span className="text-[color:var(--sb-muted)]">Website</span>
            <input
              name="websiteUrl"
              type="text"
              placeholder="https://company.com"
              defaultValue={args.websiteUrl}
              className="sb-input"
              readOnly={!args.manageable}
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
              defaultValue={args.description}
              className="sb-textarea"
              readOnly={!args.manageable}
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-[color:var(--sb-muted)]">
              Competitors (domains)
            </span>
            <textarea
              name="competitorDomains"
              placeholder={"competitor-a.com\ncompetitor-b.com"}
              defaultValue={args.competitorText}
              className="sb-textarea"
              readOnly={!args.manageable}
            />
            <span className="mt-1 text-xs text-[color:var(--sb-muted)]">
              One per line. Used to scope marketing research queries.
            </span>
          </label>

          <button
            type="submit"
            className={sbButtonClass({
              variant: "primary",
              className: "h-11 px-5 text-sm font-extrabold",
            })}
            disabled={!args.manageable}
            title={!args.manageable ? "Managers/Admins only" : undefined}
          >
            Save profile
          </button>
        </form>
      </div>

      <div className="sb-card p-7">
        <h3 className="sb-title text-xl">What to enter</h3>
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
  const contextSplitEnabled = isContextSplitEnabled();

  const [profile, personalProfile] = await Promise.all([
    prisma.workspaceProfile.findUnique({
      where: { workspaceId: membership.workspace.id },
    }),
    contextSplitEnabled
      ? prisma.workspaceMemberProfile.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: membership.workspace.id,
              userId: session.user.id,
            },
          },
        })
      : Promise.resolve(null),
  ]);

  const savedTarget = (sp.saved ?? "").trim().toLowerCase();
  const workspaceSaved = savedTarget === "workspace" || savedTarget === "1";
  const personalSaved = savedTarget === "personal";
  const competitorText = (profile?.competitorDomains ?? []).join("\n");

  if (!contextSplitEnabled) {
    return (
      <div className="grid gap-3">
        <LegacyProfileCard
          manageable={manageable}
          saved={workspaceSaved}
          workspaceSlug={membership.workspace.slug}
          websiteUrl={profile?.websiteUrl ?? ""}
          description={profile?.description ?? ""}
          competitorText={competitorText}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="sb-card p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="sb-title text-xl">Personal profile</h2>
            <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
              This context is used only for your individual pulses in this
              workspace.
            </p>
          </div>
          {personalSaved ? <div className="sb-pill">Saved</div> : null}
        </div>

        <form
          action={upsertPersonalProfile.bind(null, membership.workspace.slug)}
          className="mt-6 grid gap-4"
        >
          <label className="grid gap-1 text-sm">
            <span className="text-[color:var(--sb-muted)]">Job title</span>
            <input
              name="jobTitle"
              type="text"
              placeholder="Growth lead"
              defaultValue={personalProfile?.jobTitle ?? ""}
              className="sb-input"
              maxLength={120}
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-[color:var(--sb-muted)]">About you</span>
            <textarea
              name="about"
              placeholder="What is your background? What are you focused on? What do you care about most right now?"
              defaultValue={personalProfile?.about ?? ""}
              className="sb-textarea"
              maxLength={4000}
            />
          </label>

          <button
            type="submit"
            className={sbButtonClass({
              variant: "primary",
              className: "h-11 px-5 text-sm font-extrabold",
            })}
          >
            Save personal profile
          </button>
        </form>
      </section>

      <section className="sb-card p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="sb-title text-xl">Workspace profile</h2>
            <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
              This profile is shared with all members in this workspace and is
              used to align team-level pulse context.
            </p>
          </div>
          {workspaceSaved ? <div className="sb-pill">Saved</div> : null}
        </div>

        {!manageable ? (
          <div className="mt-5 sb-alert">
            Only managers/admins can edit the workspace profile.
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
              className="sb-input"
              readOnly={!manageable}
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-[color:var(--sb-muted)]">Description</span>
            <textarea
              name="description"
              placeholder="Describe your team, mission, customers, and current focus."
              defaultValue={profile?.description ?? ""}
              className="sb-textarea"
              readOnly={!manageable}
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-[color:var(--sb-muted)]">
              Competitors (domains)
            </span>
            <textarea
              name="competitorDomains"
              placeholder={"competitor-a.com\ncompetitor-b.com"}
              defaultValue={competitorText}
              className="sb-textarea"
              readOnly={!manageable}
            />
            <span className="mt-1 text-xs text-[color:var(--sb-muted)]">
              One per line. Used to scope market signals.
            </span>
          </label>

          <button
            type="submit"
            className={sbButtonClass({
              variant: "primary",
              className: "h-11 px-5 text-sm font-extrabold",
            })}
            disabled={!manageable}
            title={!manageable ? "Managers/Admins only" : undefined}
          >
            Save workspace profile
          </button>
        </form>
      </section>
    </div>
  );
}
