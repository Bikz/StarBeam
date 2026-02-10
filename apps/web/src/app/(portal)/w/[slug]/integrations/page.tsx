import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import {
  connectGitHub,
  disconnectGitHubConnection,
  updateGitHubRepoSelection,
} from "@/app/(portal)/w/[slug]/integrations/githubActions";
import {
  startGoogleConnect,
  disconnectGoogleConnection,
} from "@/app/(portal)/w/[slug]/integrations/googleActions";
import {
  connectLinear,
  disconnectLinearConnection,
} from "@/app/(portal)/w/[slug]/integrations/linearActions";
import {
  connectNotion,
  disconnectNotionConnection,
} from "@/app/(portal)/w/[slug]/integrations/notionActions";
import { authOptions } from "@/lib/auth";
import PageHeader from "@/components/page-header";

function statusPill(status: string) {
  return <div className="sb-pill">{status.toLowerCase()}</div>;
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

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="grid gap-6">
        <div className="sb-card p-7">
          <PageHeader
            title="Google (OAuth, read-only)"
            description="Connect Gmail, Calendar, and Drive. Tokens are stored encrypted. Drive file snapshots are stored encrypted for processing, and raw contents are not logged."
          />

          {sp.connected === "google" ? (
            <div className="mt-5 sb-alert">Connected.</div>
          ) : null}
          {sp.disconnected === "google" ? (
            <div className="mt-5 sb-alert">Disconnected.</div>
          ) : null}
          {sp.error ? (
            <div className="mt-5 sb-alert">
              <strong>Error:</strong> {sp.error}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <form
              action={startGoogleConnect.bind(null, membership.workspace.slug)}
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
                {googleConnections.map((c) => (
                  <div key={c.id} className="sb-card-inset px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-[color:var(--sb-fg)]">
                        {c.googleAccountEmail}
                      </div>
                      {statusPill(c.status)}
                    </div>
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
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sb-card p-7">
          <PageHeader
            title="GitHub (token)"
            description="Paste a GitHub personal access token. This is the quickest way to connect without configuring an OAuth app."
          />

          {sp.connected === "github" ? (
            <div className="mt-5 sb-alert">Connected.</div>
          ) : null}
          {sp.disconnected === "github" ? (
            <div className="mt-5 sb-alert">Disconnected.</div>
          ) : null}

          <form
            action={connectGitHub.bind(null, membership.workspace.slug)}
            className="mt-5 grid gap-3"
          >
            <label className="grid gap-2">
              <div className="text-xs font-extrabold sb-title">
                Personal access token
              </div>
              <input
                name="token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                className="sb-input"
                placeholder="ghp_…"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2">
                <div className="text-xs font-extrabold sb-title">
                  Repo scope
                </div>
                <select
                  name="mode"
                  defaultValue="SELECTED"
                  className="sb-select"
                >
                  <option value="SELECTED">
                    Selected repos only (recommended)
                  </option>
                  <option value="ALL">All accessible repos</option>
                </select>
              </label>
              <label className="grid gap-2">
                <div className="text-xs font-extrabold sb-title">
                  Selected repos
                </div>
                <textarea
                  name="repos"
                  rows={3}
                  className="sb-textarea sb-textarea-compact"
                  placeholder={"owner/repo\nowner/another-repo"}
                />
              </label>
            </div>
            <div className="text-[11px] text-[color:var(--sb-muted)] leading-relaxed">
              Tip: keep workspace context scoped. If you choose Selected,
              Starbeam won’t ingest GitHub until you list one or more repos.
            </div>
            <div>
              <button
                type="submit"
                className={sbButtonClass({
                  variant: "primary",
                  className: "h-11 px-5 text-sm font-extrabold",
                })}
              >
                Connect GitHub
              </button>
            </div>
          </form>

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
                {githubConnections.map((c) => (
                  <div key={c.id} className="sb-card-inset px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-[color:var(--sb-fg)]">
                        {c.githubLogin}
                      </div>
                      {statusPill(c.status)}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <form
                        action={updateGitHubRepoSelection.bind(
                          null,
                          membership.workspace.slug,
                          c.id,
                        )}
                        className="grid w-full gap-2"
                      >
                        <div className="grid gap-1">
                          <div className="text-[11px] font-extrabold sb-title">
                            Repo scope
                          </div>
                          <select
                            name="mode"
                            defaultValue={c.repoSelectionMode}
                            className="sb-select sb-select-compact"
                          >
                            <option value="ALL">All accessible repos</option>
                            <option value="SELECTED">
                              Selected repos only
                            </option>
                          </select>
                        </div>

                        <div className="grid gap-1">
                          <div className="text-[11px] font-extrabold sb-title">
                            Selected repos
                          </div>
                          <textarea
                            name="repos"
                            defaultValue={(c.selectedRepoFullNames ?? []).join(
                              "\n",
                            )}
                            rows={3}
                            className="sb-textarea sb-textarea-compact"
                            placeholder={"owner/repo\nowner/another-repo"}
                          />
                          <div className="text-[11px] text-[color:var(--sb-muted)]">
                            Used only when repo scope is set to Selected.
                          </div>
                          {c.repoSelectionMode === "SELECTED" &&
                          (c.selectedRepoFullNames ?? []).length === 0 ? (
                            <div className="text-[11px] text-[color:var(--sb-muted)]">
                              No repos selected yet, so GitHub sync will be
                              skipped.
                            </div>
                          ) : null}
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="submit"
                            className={sbButtonClass({
                              variant: "secondary",
                              className: "px-4 py-2 text-xs font-semibold",
                            })}
                          >
                            Save scope
                          </button>
                        </div>
                      </form>
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
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sb-card p-7">
          <PageHeader
            title="Linear (token)"
            description="Paste a Linear API key. Starbeam will ingest assigned issues and recent updates for your workspace pulse."
          />

          {sp.connected === "linear" ? (
            <div className="mt-5 sb-alert">Connected.</div>
          ) : null}
          {sp.disconnected === "linear" ? (
            <div className="mt-5 sb-alert">Disconnected.</div>
          ) : null}

          <form
            action={connectLinear.bind(null, membership.workspace.slug)}
            className="mt-5 grid gap-3"
          >
            <label className="grid gap-2">
              <div className="text-xs font-extrabold sb-title">API key</div>
              <input
                name="token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                className="sb-input"
                placeholder="lin_api_…"
              />
            </label>
            <div>
              <button
                type="submit"
                className={sbButtonClass({
                  variant: "primary",
                  className: "h-11 px-5 text-sm font-extrabold",
                })}
              >
                Connect Linear
              </button>
            </div>
          </form>

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
                {linearConnections.map((c) => (
                  <div key={c.id} className="sb-card-inset px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-[color:var(--sb-fg)]">
                        {c.linearUserEmail ?? c.linearUserId}
                      </div>
                      {statusPill(c.status)}
                    </div>
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
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sb-card p-7">
          <PageHeader
            title="Notion (token)"
            description="Paste a Notion integration token. Make sure to share the relevant pages/databases with the integration, otherwise Notion search will return nothing."
          />

          {sp.connected === "notion" ? (
            <div className="mt-5 sb-alert">Connected.</div>
          ) : null}
          {sp.disconnected === "notion" ? (
            <div className="mt-5 sb-alert">Disconnected.</div>
          ) : null}

          <form
            action={connectNotion.bind(null, membership.workspace.slug)}
            className="mt-5 grid gap-3"
          >
            <label className="grid gap-2">
              <div className="text-xs font-extrabold sb-title">
                Integration token
              </div>
              <input
                name="token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                className="sb-input"
                placeholder="secret_…"
              />
            </label>
            <div>
              <button
                type="submit"
                className={sbButtonClass({
                  variant: "primary",
                  className: "h-11 px-5 text-sm font-extrabold",
                })}
              >
                Connect Notion
              </button>
            </div>
          </form>

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
                {notionConnections.map((c) => (
                  <div key={c.id} className="sb-card-inset px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-[color:var(--sb-fg)]">
                        {c.notionWorkspaceName ?? c.notionBotId}
                      </div>
                      {statusPill(c.status)}
                    </div>
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
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <div className="sb-card p-7">
          <PageHeader title="Privacy" />
          <div className="mt-3 grid gap-3 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            <div>Token-based connectors are stored encrypted.</div>
            <div>
              Managers cannot view employee raw connected-tool data. Connections
              are per-user and scoped to a workspace.
            </div>
          </div>
        </div>

        <div className="sb-card p-7">
          <PageHeader title="Next" />
          <div className="mt-3 grid gap-3 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            <div>
              After you connect an integration, go to{" "}
              <span className="sb-title">Runs</span> and click{" "}
              <span className="sb-title">Run now</span> to ingest and generate
              an updated pulse.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
