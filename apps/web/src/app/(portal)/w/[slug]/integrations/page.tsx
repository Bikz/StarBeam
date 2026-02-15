import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import { disconnectGitHubConnection } from "@/app/(portal)/w/[slug]/integrations/githubActions";
import {
  startGoogleConnect,
  disconnectGoogleConnection,
} from "@/app/(portal)/w/[slug]/integrations/googleActions";
import { disconnectLinearConnection } from "@/app/(portal)/w/[slug]/integrations/linearActions";
import { disconnectNotionConnection } from "@/app/(portal)/w/[slug]/integrations/notionActions";
import { authOptions } from "@/lib/auth";
import PageHeader from "@/components/page-header";
import GitHubTokenConnectForm from "@/app/(portal)/w/[slug]/integrations/GitHubTokenConnectForm";
import GitHubRepoSelectionForm from "@/app/(portal)/w/[slug]/integrations/GitHubRepoSelectionForm";
import LinearTokenConnectForm from "@/app/(portal)/w/[slug]/integrations/LinearTokenConnectForm";
import NotionTokenConnectForm from "@/app/(portal)/w/[slug]/integrations/NotionTokenConnectForm";

function statusPill(status: string) {
  return <div className="sb-pill">{status.toLowerCase()}</div>;
}

const STALE_SYNC_MS = 6 * 60 * 60 * 1000;

function relativeTime(from: Date, to: Date): string {
  const diffMs = Math.max(0, to.getTime() - from.getTime());
  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 10) return `${weeks}w ago`;

  return `${Math.floor(days / 30)}mo ago`;
}

function latestDate(values: Array<Date | null | undefined>): Date | null {
  let latest: Date | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!latest || value.getTime() > latest.getTime()) latest = value;
  }
  return latest;
}

type SyncTone = "fresh" | "stale" | "never";

function describeSyncFreshness(args: {
  lastSyncedAt?: Date | null;
  lastAttemptedAt?: Date | null;
  now: Date;
}): { label: string; tone: SyncTone } {
  if (args.lastSyncedAt) {
    const ageMs = args.now.getTime() - args.lastSyncedAt.getTime();
    return {
      label: `Last synced ${relativeTime(args.lastSyncedAt, args.now)}`,
      tone: ageMs > STALE_SYNC_MS ? "stale" : "fresh",
    };
  }

  if (args.lastAttemptedAt) {
    const ageMs = args.now.getTime() - args.lastAttemptedAt.getTime();
    return {
      label: `Last attempt ${relativeTime(args.lastAttemptedAt, args.now)}`,
      tone: ageMs > STALE_SYNC_MS ? "stale" : "never",
    };
  }

  return { label: "No sync attempts yet", tone: "never" };
}

function statusGuidance(status: string, tone: SyncTone): string | null {
  if (status === "REVOKED") {
    return "Access was revoked. Reconnect to resume syncing.";
  }
  if (status === "ERROR") {
    return "Last sync failed. Starbeam retries automatically; reconnect if this keeps failing.";
  }
  if (status === "CONNECTED" && tone === "stale") {
    return "Connected but stale. Go to Runs and click Run now to refresh sooner.";
  }
  if (status === "CONNECTED" && tone === "never") {
    return "Connected. The first sync usually starts within a few minutes.";
  }
  return null;
}

export default async function IntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    connected?: string;
    disconnected?: string;
    error?: string;
  }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const [{ slug }, sp] = await Promise.all([params, searchParams]);

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug } },
    include: { workspace: true },
  });
  if (!membership) notFound();

  const [
    googleConnections,
    githubConnections,
    linearConnections,
    notionConnections,
  ] = await Promise.all([
    prisma.googleConnection.findMany({
      where: {
        workspaceId: membership.workspace.id,
        ownerUserId: session.user.id,
      },
      include: {
        syncState: {
          select: {
            lastGmailSyncAt: true,
            lastCalendarSyncAt: true,
            lastDriveSyncAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.gitHubConnection.findMany({
      where: {
        workspaceId: membership.workspace.id,
        ownerUserId: session.user.id,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.linearConnection.findMany({
      where: {
        workspaceId: membership.workspace.id,
        ownerUserId: session.user.id,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.notionConnection.findMany({
      where: {
        workspaceId: membership.workspace.id,
        ownerUserId: session.user.id,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const now = new Date();

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="grid gap-6">
        <div className="sb-card p-7">
          <PageHeader
            title="Personal integrations"
            description="Connect your tools so Starbeam can pull updates into your pulse. These connections are personal to you, and raw connected data isn’t shared with teammates."
          />
        </div>

        <div className="sb-card p-7" id="google">
          <PageHeader
            title="Google (OAuth, read-only)"
            description="Connect Gmail, Calendar, and Drive so Starbeam can pull in what matters. Tokens are stored encrypted, and raw contents are not logged."
          />

          {sp.connected === "google" ? (
            <div className="mt-5 sb-alert">Connected.</div>
          ) : null}
          {sp.disconnected === "google" ? (
            <div className="mt-5 sb-alert">Disconnected.</div>
          ) : null}
          {sp.error ? (
            <div className="mt-5 sb-alert">
              <strong>Couldn’t connect Google.</strong>{" "}
              <span className="text-[color:var(--sb-muted)]">
                Please try again.
              </span>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <form
              action={startGoogleConnect.bind(
                null,
                membership.workspace.slug,
                "",
              )}
            >
              <button
                type="submit"
                className={sbButtonClass({
                  variant: "primary",
                  className: "h-11 px-5 text-sm font-extrabold",
                })}
              >
                Connect Google
              </button>
            </form>
          </div>

          <div className="mt-7">
            <div className="text-xs font-extrabold sb-title">
              Your connections
            </div>
            {googleConnections.length === 0 ? (
              <div className="mt-2 text-sm text-[color:var(--sb-muted)]">
                No connections yet.
              </div>
            ) : (
              <div className="mt-3 grid gap-2">
                {googleConnections.map((c) => {
                  const freshness = describeSyncFreshness({
                    lastSyncedAt: latestDate([
                      c.syncState?.lastGmailSyncAt,
                      c.syncState?.lastCalendarSyncAt,
                      c.syncState?.lastDriveSyncAt,
                    ]),
                    lastAttemptedAt: c.lastAttemptedAt,
                    now,
                  });
                  const guidance = statusGuidance(c.status, freshness.tone);

                  return (
                    <div key={c.id} className="sb-card-inset px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold text-[color:var(--sb-fg)]">
                          {c.googleAccountEmail}
                        </div>
                        {statusPill(c.status)}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                        {freshness.label}
                      </div>
                      {guidance ? (
                        <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                          {guidance}
                        </div>
                      ) : null}
                      <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                        Scopes:{" "}
                        {c.scopes.length ? c.scopes.join(", ") : "unknown"}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <form
                          action={disconnectGoogleConnection.bind(
                            null,
                            membership.workspace.slug,
                            c.id,
                          )}
                        >
                          <button
                            type="submit"
                            className={sbButtonClass({
                              variant: "secondary",
                              className: "px-4 py-2 text-xs font-semibold",
                            })}
                          >
                            Disconnect
                          </button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="sb-card p-7" id="github">
          <PageHeader
            title="GitHub (token)"
            description="Paste a GitHub token so Starbeam can read issues, PRs, and commits for the repos you choose."
          />

          {sp.connected === "github" ? (
            <div className="mt-5 sb-alert">Connected.</div>
          ) : null}
          {sp.disconnected === "github" ? (
            <div className="mt-5 sb-alert">Disconnected.</div>
          ) : null}

          <GitHubTokenConnectForm workspaceSlug={membership.workspace.slug} />

          <div className="mt-7">
            <div className="text-xs font-extrabold sb-title">
              Your connections
            </div>
            {githubConnections.length === 0 ? (
              <div className="mt-2 text-sm text-[color:var(--sb-muted)]">
                No connections yet.
              </div>
            ) : (
              <div className="mt-3 grid gap-2">
                {githubConnections.map((c) => {
                  const freshness = describeSyncFreshness({
                    lastSyncedAt: c.lastSyncedAt,
                    lastAttemptedAt: c.lastAttemptedAt,
                    now,
                  });
                  const guidance = statusGuidance(c.status, freshness.tone);

                  return (
                    <div key={c.id} className="sb-card-inset px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold text-[color:var(--sb-fg)]">
                          {c.githubLogin}
                        </div>
                        {statusPill(c.status)}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                        {freshness.label}
                      </div>
                      {guidance ? (
                        <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                          {guidance}
                        </div>
                      ) : null}
                      <div className="mt-3 flex gap-2">
                        <GitHubRepoSelectionForm
                          workspaceSlug={membership.workspace.slug}
                          connectionId={c.id}
                          initialMode={c.repoSelectionMode}
                          initialRepos={c.selectedRepoFullNames ?? []}
                        />
                        <form
                          action={disconnectGitHubConnection.bind(
                            null,
                            membership.workspace.slug,
                            c.id,
                          )}
                        >
                          <button
                            type="submit"
                            className={sbButtonClass({
                              variant: "secondary",
                              className: "px-4 py-2 text-xs font-semibold",
                            })}
                          >
                            Disconnect
                          </button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="sb-card p-7" id="linear">
          <PageHeader
            title="Linear (token)"
            description="Paste a Linear API key so Starbeam can read your assigned issues and recent updates."
          />

          {sp.connected === "linear" ? (
            <div className="mt-5 sb-alert">Connected.</div>
          ) : null}
          {sp.disconnected === "linear" ? (
            <div className="mt-5 sb-alert">Disconnected.</div>
          ) : null}

          <LinearTokenConnectForm workspaceSlug={membership.workspace.slug} />

          <div className="mt-7">
            <div className="text-xs font-extrabold sb-title">
              Your connections
            </div>
            {linearConnections.length === 0 ? (
              <div className="mt-2 text-sm text-[color:var(--sb-muted)]">
                No connections yet.
              </div>
            ) : (
              <div className="mt-3 grid gap-2">
                {linearConnections.map((c) => {
                  const freshness = describeSyncFreshness({
                    lastSyncedAt: c.lastSyncedAt,
                    lastAttemptedAt: c.lastAttemptedAt,
                    now,
                  });
                  const guidance = statusGuidance(c.status, freshness.tone);

                  return (
                    <div key={c.id} className="sb-card-inset px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold text-[color:var(--sb-fg)]">
                          {c.linearUserEmail ?? c.linearUserId}
                        </div>
                        {statusPill(c.status)}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                        {freshness.label}
                      </div>
                      {guidance ? (
                        <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                          {guidance}
                        </div>
                      ) : null}
                      <div className="mt-3 flex gap-2">
                        <form
                          action={disconnectLinearConnection.bind(
                            null,
                            membership.workspace.slug,
                            c.id,
                          )}
                        >
                          <button
                            type="submit"
                            className={sbButtonClass({
                              variant: "secondary",
                              className: "px-4 py-2 text-xs font-semibold",
                            })}
                          >
                            Disconnect
                          </button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="sb-card p-7" id="notion">
          <PageHeader
            title="Notion (token)"
            description="Paste a Notion integration token so Starbeam can search the pages and databases you share with that integration."
          />

          {sp.connected === "notion" ? (
            <div className="mt-5 sb-alert">Connected.</div>
          ) : null}
          {sp.disconnected === "notion" ? (
            <div className="mt-5 sb-alert">Disconnected.</div>
          ) : null}

          <NotionTokenConnectForm workspaceSlug={membership.workspace.slug} />

          <div className="mt-7">
            <div className="text-xs font-extrabold sb-title">
              Your connections
            </div>
            {notionConnections.length === 0 ? (
              <div className="mt-2 text-sm text-[color:var(--sb-muted)]">
                No connections yet.
              </div>
            ) : (
              <div className="mt-3 grid gap-2">
                {notionConnections.map((c) => {
                  const freshness = describeSyncFreshness({
                    lastSyncedAt: c.lastSyncedAt,
                    lastAttemptedAt: c.lastAttemptedAt,
                    now,
                  });
                  const guidance = statusGuidance(c.status, freshness.tone);

                  return (
                    <div key={c.id} className="sb-card-inset px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold text-[color:var(--sb-fg)]">
                          {c.notionWorkspaceName ?? c.notionBotId}
                        </div>
                        {statusPill(c.status)}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                        {freshness.label}
                      </div>
                      {guidance ? (
                        <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                          {guidance}
                        </div>
                      ) : null}
                      <div className="mt-3 flex gap-2">
                        <form
                          action={disconnectNotionConnection.bind(
                            null,
                            membership.workspace.slug,
                            c.id,
                          )}
                        >
                          <button
                            type="submit"
                            className={sbButtonClass({
                              variant: "secondary",
                              className: "px-4 py-2 text-xs font-semibold",
                            })}
                          >
                            Disconnect
                          </button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid content-start gap-6">
        <aside className="sb-card p-6 sm:p-7">
          <PageHeader title="More info" size="sm" as="h3" />

          <div className="mt-4 grid gap-4">
            <section className="sb-card-inset p-4">
              <div className="text-xs font-extrabold sb-title">Privacy</div>
              <div className="mt-2 grid gap-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                <div>Token-based connectors are stored encrypted.</div>
                <div>
                  Managers cannot view employee raw connected-tool data.
                  Connections are per-user and scoped to a workspace.
                </div>
              </div>
            </section>

            <section className="sb-card-inset p-4">
              <div className="text-xs font-extrabold sb-title">Next</div>
              <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                Next: open <span className="sb-title">Runs</span> and click{" "}
                <span className="sb-title">Run now</span> if you want an update
                right away.
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}
