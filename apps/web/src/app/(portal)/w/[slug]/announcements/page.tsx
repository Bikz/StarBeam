import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import {
  createAnnouncement,
  deleteAnnouncement,
  dismissAnnouncement,
  toggleAnnouncementPinned,
  updateAnnouncement,
} from "@/app/(portal)/w/[slug]/announcements/actions";
import PageHeader from "@/components/page-header";
import { IconPencil, IconPlus, IconTrash, IconX } from "@/components/sb-icons";

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export default async function AnnouncementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  const composeRaw = sp.compose;
  const editRaw = sp.edit;
  const compose = composeRaw === "1";
  const edit = typeof editRaw === "string" ? editRaw : "";

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug } },
    include: { workspace: true },
  });
  if (!membership) notFound();

  const manageable = canManage(membership.role);

  const announcements = manageable
    ? await prisma.announcement.findMany({
        where: { workspaceId: membership.workspace.id },
        include: {
          author: true,
          dismissals: {
            where: { userId: session.user.id },
            select: { id: true },
          },
        },
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        take: 50,
      })
    : await prisma.announcement.findMany({
        where: {
          workspaceId: membership.workspace.id,
          dismissals: { none: { userId: session.user.id } },
        },
        include: { author: true },
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        take: 50,
      });

  const base = `/w/${membership.workspace.slug}`;

  const panelOpen = manageable && (compose || Boolean(edit));
  const editingAnnouncement = edit
    ? (announcements.find((a) => a.id === edit) ?? null)
    : null;
  const editNotFound = Boolean(edit) && !editingAnnouncement;

  const listHeaderActions = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="text-xs text-[color:var(--sb-muted)]">
        {manageable
          ? `Total: ${announcements.length}`
          : `Visible to you: ${announcements.length}`}
      </div>
      {manageable ? (
        <Link
          href={`${base}/announcements?compose=1`}
          aria-label="Add announcement"
          title="Add announcement"
          className={sbButtonClass({ variant: "secondary", size: "icon" })}
        >
          <IconPlus className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );

  const sideCard = panelOpen ? (
    <div className="sb-card p-7">
      <PageHeader
        title={
          editingAnnouncement ? "Edit announcement" : "Post an announcement"
        }
        description={
          "Keep it short. In v0, announcements can trigger a badge and appear in the macOS app on next sync."
        }
        actions={
          <Link
            href={`${base}/announcements`}
            aria-label="Close"
            title="Close"
            className={sbButtonClass({ variant: "ghost", size: "icon" })}
          >
            <IconX className="h-4 w-4" />
          </Link>
        }
      />

      {editNotFound ? (
        <div className="mt-5 sb-alert">That announcement no longer exists.</div>
      ) : !manageable ? (
        <div className="mt-5 sb-alert">
          Only managers/admins can post announcements.
        </div>
      ) : editingAnnouncement ? (
        <div className="mt-5 grid gap-6">
          <form
            action={updateAnnouncement.bind(
              null,
              membership.workspace.slug,
              editingAnnouncement.id,
            )}
            className="grid gap-3"
          >
            <label className="grid gap-1 text-sm">
              <span className="text-[color:var(--sb-muted)]">Title</span>
              <input
                name="title"
                defaultValue={editingAnnouncement.title}
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
                defaultValue={editingAnnouncement.body ?? ""}
                className="sb-textarea"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="pinned"
                defaultChecked={editingAnnouncement.pinned}
              />
              <span className="text-[color:var(--sb-muted)]">Pin</span>
            </label>
            <button
              type="submit"
              className={sbButtonClass({
                variant: "primary",
                className: "h-11 px-5 text-sm font-extrabold",
              })}
            >
              Save changes
            </button>
          </form>

          <form
            action={deleteAnnouncement.bind(
              null,
              membership.workspace.slug,
              editingAnnouncement.id,
            )}
            className="grid gap-3"
          >
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <div className="text-sm font-semibold">Delete announcement</div>
              <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                This permanently deletes the announcement for everyone.
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" name="confirm" required />
                <span className="text-[color:var(--sb-muted)]">
                  I understand
                </span>
              </label>
              <button
                type="submit"
                className={sbButtonClass({
                  variant: "secondary",
                  className:
                    "mt-3 w-full h-11 px-5 text-sm font-extrabold border border-red-500/30 text-red-700 hover:bg-red-500/10",
                })}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <IconTrash className="h-4 w-4" />
                  Delete
                </span>
              </button>
            </div>
          </form>
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
  ) : null;

  return (
    <div className="grid gap-6">
      <div
        className={
          panelOpen ? "grid gap-6 lg:grid-cols-[1.2fr_0.8fr]" : "grid gap-6"
        }
      >
        <div className="sb-card p-7">
          <PageHeader
            title="Announcements"
            description={
              "Announcements stay in the pulse until dismissed. Pinned announcements rank above everything else."
            }
            actions={listHeaderActions}
          />

          {announcements.length === 0 ? (
            <div className="mt-5 sb-alert">
              {manageable
                ? "No announcements yet. Click + to post one."
                : "Nothing to show."}
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              {announcements.map((a) => {
                const dismissedForYou =
                  manageable &&
                  "dismissals" in a &&
                  Array.isArray(a.dismissals) &&
                  a.dismissals.length > 0;

                return (
                  <div key={a.id} className="sb-card-inset p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="sb-title text-lg leading-tight">
                          {a.title}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                          {a.pinned ? "Pinned" : "Normal"}
                          {dismissedForYou ? " · Dismissed for you" : ""}
                          {" · "}by {a.author.email}
                          {" · "}
                          {a.createdAt.toLocaleString()}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {manageable ? (
                          <>
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
                            <Link
                              href={`${base}/announcements?edit=${a.id}`}
                              aria-label="Edit"
                              title="Edit"
                              className={sbButtonClass({
                                variant: "secondary",
                                size: "icon",
                              })}
                            >
                              <IconPencil className="h-4 w-4" />
                            </Link>
                          </>
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
                );
              })}
            </div>
          )}
        </div>

        {sideCard}
      </div>
    </div>
  );
}
