import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import {
  createAnnouncement,
  dismissAnnouncement,
  toggleAnnouncementPinned,
} from "@/app/(portal)/w/[slug]/announcements/actions";
import PageHeader from "@/components/page-header";

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export default async function AnnouncementsPage({
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

  const manageable = canManage(membership.role);

  const announcements = await prisma.announcement.findMany({
    where: {
      workspaceId: membership.workspace.id,
      dismissals: { none: { userId: session.user.id } },
    },
    include: { author: true },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="sb-card p-7">
        <PageHeader
          title="Announcements"
          description={
            "Announcements stay in the pulse until dismissed. Pinned announcements rank above everything else."
          }
          actions={
            <div className="text-xs text-[color:var(--sb-muted)]">
              Visible to you: {announcements.length}
            </div>
          }
        />

        {announcements.length === 0 ? (
          <div className="mt-5 sb-alert">
            Nothing to show. Managers can post a pinned note to drive the demo.
          </div>
        ) : (
          <div className="mt-6 grid gap-3">
            {announcements.map((a) => (
              <div key={a.id} className="sb-card-inset p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="sb-title text-lg leading-tight">
                      {a.title}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                      {a.pinned ? "Pinned" : "Normal"} - by {a.author.email} -{" "}
                      {a.createdAt.toLocaleString()}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {manageable ? (
                      <form
                        action={toggleAnnouncementPinned.bind(
                          null,
                          membership.workspace.slug,
                          a.id,
                        )}
                      >
                        <button
                          type="submit"
                          className={sbButtonClass({
                            variant: "secondary",
                            className: "px-4 py-2 text-xs font-semibold",
                          })}
                        >
                          {a.pinned ? "Unpin" : "Pin"}
                        </button>
                      </form>
                    ) : null}
                    <form
                      action={dismissAnnouncement.bind(
                        null,
                        membership.workspace.slug,
                        a.id,
                      )}
                    >
                      <button
                        type="submit"
                        className={sbButtonClass({
                          variant: "secondary",
                          className: "px-4 py-2 text-xs font-semibold",
                        })}
                      >
                        Dismiss
                      </button>
                    </form>
                  </div>
                </div>

                {a.body ? (
                  <div className="mt-3 text-sm text-[color:var(--sb-muted)] leading-relaxed whitespace-pre-wrap">
                    {a.body}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sb-card p-7">
        <PageHeader
          title="Post an announcement"
          description={
            "Keep it short. In v0, announcements can trigger a badge and appear in the macOS app on next sync."
          }
        />

        {!manageable ? (
          <div className="mt-5 sb-alert">
            Only managers/admins can post announcements.
          </div>
        ) : (
          <form
            action={createAnnouncement.bind(null, membership.workspace.slug)}
            className="mt-5 grid gap-3"
          >
            <label className="grid gap-1 text-sm">
              <span className="text-[color:var(--sb-muted)]">Title</span>
              <input
                name="title"
                placeholder="Q2 focus: ship Feature X onboarding improvements"
                className="sb-input"
                required
                minLength={3}
                maxLength={90}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[color:var(--sb-muted)]">
                Body (optional)
              </span>
              <textarea
                name="body"
                placeholder="One or two lines of context."
                className="sb-textarea"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="pinned" defaultChecked />
              <span className="text-[color:var(--sb-muted)]">Pin</span>
            </label>
            <button
              type="submit"
              className={sbButtonClass({
                variant: "primary",
                className: "h-11 px-5 text-sm font-extrabold",
              })}
            >
              Post announcement
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
