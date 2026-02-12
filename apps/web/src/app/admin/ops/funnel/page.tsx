import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import { updateWorkspaceProgram } from "@/app/admin/ops/funnel/actions";
import { isAdminEmail } from "@/lib/admin";
import { authOptions } from "@/lib/auth";
import {
  getOpsFunnelSummary,
  parseProgramStatusFilter,
  parseWindowDays,
} from "@/lib/opsFunnel";

function fmtDate(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export default async function AdminOpsFunnelPage({
  searchParams,
}: {
  searchParams?: Promise<{ windowDays?: string; programStatus?: string; updated?: string; error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/login");
  }

  const sp = (await searchParams) ?? {};
  const windowDays = parseWindowDays(sp.windowDays);
  const programStatus = parseProgramStatusFilter(sp.programStatus);
  const updated = sp.updated === "1";
  const error = typeof sp.error === "string" ? sp.error : "";

  const [summary, allWorkspaces] = await Promise.all([
    getOpsFunnelSummary({ windowDays, programStatusFilter: programStatus }),
    prisma.workspace.findMany({
      orderBy: { updatedAt: "desc" },
      take: 80,
      select: {
        id: true,
        name: true,
        slug: true,
        programType: true,
        programStatus: true,
        programStartedAt: true,
        programEndedAt: true,
        programNotes: true,
      },
    }),
  ]);

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="sb-card p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="sb-title text-2xl">Ops funnel</div>
              <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                Activation, week-1 retention, and design partner program status.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/admin/ops/funnel?windowDays=7"
                className={sbButtonClass({
                  variant: windowDays === 7 ? "primary" : "secondary",
                  className: "h-10 px-4 text-xs font-semibold",
                })}
              >
                7d
              </Link>
              <Link
                href="/admin/ops/funnel?windowDays=28"
                className={sbButtonClass({
                  variant: windowDays === 28 ? "primary" : "secondary",
                  className: "h-10 px-4 text-xs font-semibold",
                })}
              >
                28d
              </Link>
              <a
                href={`/api/admin/ops/funnel/export?windowDays=${windowDays}&programStatus=${encodeURIComponent(programStatus)}&format=csv`}
                className={sbButtonClass({
                  variant: "secondary",
                  className: "h-10 px-4 text-xs font-semibold",
                })}
              >
                Export CSV
              </a>
              <a
                href={`/api/admin/ops/funnel/export?windowDays=${windowDays}&programStatus=${encodeURIComponent(programStatus)}&format=json`}
                className={sbButtonClass({
                  variant: "secondary",
                  className: "h-10 px-4 text-xs font-semibold",
                })}
              >
                Export JSON
              </a>
              <Link
                href="/admin/waitlist"
                className={sbButtonClass({
                  variant: "secondary",
                  className: "h-10 px-4 text-xs font-semibold",
                })}
              >
                Waitlist
              </Link>
              <Link
                href="/admin/feedback"
                className={sbButtonClass({
                  variant: "secondary",
                  className: "h-10 px-4 text-xs font-semibold",
                })}
              >
                Feedback
              </Link>
            </div>
          </div>

          {updated ? <div className="mt-6 sb-alert">Program settings updated.</div> : null}
          {error ? (
            <div className="mt-6 sb-alert">
              <strong>Error:</strong> {error}
            </div>
          ) : null}

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            <div className="sb-card-inset p-4">
              <div className="text-xs text-[color:var(--sb-muted)]">Signed in</div>
              <div className="mt-1 text-2xl font-extrabold">{summary.activation.signedIn}</div>
              <div className="mt-2 text-xs text-[color:var(--sb-muted)]">
                Google connected: {summary.activation.googleConnected}
              </div>
            </div>
            <div className="sb-card-inset p-4">
              <div className="text-xs text-[color:var(--sb-muted)]">First pulse</div>
              <div className="mt-1 text-2xl font-extrabold">{summary.activation.firstPulseReady}</div>
              <div className="mt-2 text-xs text-[color:var(--sb-muted)]">
                Queued: {summary.activation.firstPulseQueued}
              </div>
            </div>
            <div className="sb-card-inset p-4">
              <div className="text-xs text-[color:var(--sb-muted)]">Ready SLAs</div>
              <div className="mt-1 text-2xl font-extrabold">{summary.activation.readyWithin24h}</div>
              <div className="mt-2 text-xs text-[color:var(--sb-muted)]">
                within 7d: {summary.activation.readyWithin7d}
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            <div className="sb-card-inset p-4">
              <div className="text-xs text-[color:var(--sb-muted)]">Week-1 pulse views</div>
              <div className="mt-1 text-2xl font-extrabold">{summary.retention.pulseViewedWeek1_1plus}</div>
              <div className="mt-2 text-xs text-[color:var(--sb-muted)]">
                3+ opens: {summary.retention.pulseViewedWeek1_3plus}
              </div>
            </div>
            <div className="sb-card-inset p-4">
              <div className="text-xs text-[color:var(--sb-muted)]">Week-1 macOS sync</div>
              <div className="mt-1 text-2xl font-extrabold">{summary.retention.overviewSyncedWeek1_1plus}</div>
              <div className="mt-2 text-xs text-[color:var(--sb-muted)]">overview synced at least once</div>
            </div>
            <div className="sb-card-inset p-4">
              <div className="text-xs text-[color:var(--sb-muted)]">Design partners</div>
              <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                Prospect: <strong className="text-[color:var(--sb-fg)]">{summary.designPartners.prospectCount}</strong>
              </div>
              <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                Active: <strong className="text-[color:var(--sb-fg)]">{summary.designPartners.activeCount}</strong>
              </div>
              <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                Churned: <strong className="text-[color:var(--sb-fg)]">{summary.designPartners.churnedCount}</strong>
              </div>
            </div>
          </div>

          <div className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-extrabold sb-title">Design partner workspace usage</div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/ops/funnel?windowDays=${windowDays}&programStatus=ALL`}
                  className={sbButtonClass({
                    variant: programStatus === "ALL" ? "primary" : "secondary",
                    className: "h-9 px-3 text-[11px] font-semibold",
                  })}
                >
                  All
                </Link>
                <Link
                  href={`/admin/ops/funnel?windowDays=${windowDays}&programStatus=PROSPECT`}
                  className={sbButtonClass({
                    variant: programStatus === "PROSPECT" ? "primary" : "secondary",
                    className: "h-9 px-3 text-[11px] font-semibold",
                  })}
                >
                  Prospect
                </Link>
                <Link
                  href={`/admin/ops/funnel?windowDays=${windowDays}&programStatus=ACTIVE`}
                  className={sbButtonClass({
                    variant: programStatus === "ACTIVE" ? "primary" : "secondary",
                    className: "h-9 px-3 text-[11px] font-semibold",
                  })}
                >
                  Active
                </Link>
                <Link
                  href={`/admin/ops/funnel?windowDays=${windowDays}&programStatus=CHURNED`}
                  className={sbButtonClass({
                    variant: programStatus === "CHURNED" ? "primary" : "secondary",
                    className: "h-9 px-3 text-[11px] font-semibold",
                  })}
                >
                  Churned
                </Link>
              </div>
            </div>

            {summary.byWorkspace.length === 0 ? (
              <div className="mt-3 text-sm text-[color:var(--sb-muted)]">
                No design partner workspaces in this filter.
              </div>
            ) : (
              <div className="mt-3 grid gap-2">
                {summary.byWorkspace.map((workspace) => (
                  <div key={workspace.workspaceId} className="sb-card-inset p-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-[color:var(--sb-fg)]">
                          {workspace.workspaceName}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                          {workspace.workspaceSlug} · {workspace.programStatus.toLowerCase()} · start{" "}
                          {workspace.programStartedAt ?? "—"}
                        </div>
                      </div>
                      <div className="text-xs text-[color:var(--sb-muted)]">
                        WAU: <strong className="text-[color:var(--sb-fg)]">{workspace.weeklyActiveUsers}</strong>{" "}
                        · Ready users: <strong className="text-[color:var(--sb-fg)]">{workspace.firstPulseReadyUsers}</strong>{" "}
                        · Google users: <strong className="text-[color:var(--sb-fg)]">{workspace.googleConnectedUsers}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-10">
            <div className="text-xs font-extrabold sb-title">Top triage categories (last 7d)</div>
            {summary.feedback.topCategories7d.length === 0 ? (
              <div className="mt-3 text-sm text-[color:var(--sb-muted)]">
                No triaged feedback categories in the last 7 days.
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {summary.feedback.topCategories7d.map((row) => (
                  <div key={row.category} className="sb-card-inset px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span>{row.category.toLowerCase().replaceAll("_", " ")}</span>
                      <strong>{row.count}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-10">
            <div className="text-xs font-extrabold sb-title">Workspace program controls</div>
            <div className="mt-2 text-xs text-[color:var(--sb-muted)]">
              Set design partner lifecycle fields directly on workspaces.
            </div>
            <div className="mt-3 grid gap-3">
              {allWorkspaces.map((workspace) => (
                <form key={workspace.id} action={updateWorkspaceProgram} className="sb-card-inset p-4">
                  <input type="hidden" name="workspaceId" value={workspace.id} />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-sm text-[color:var(--sb-fg)]">{workspace.name}</div>
                      <div className="text-xs text-[color:var(--sb-muted)]">{workspace.slug}</div>
                    </div>
                    <button
                      type="submit"
                      className={sbButtonClass({
                        variant: "secondary",
                        className: "h-9 px-4 text-xs font-semibold",
                      })}
                    >
                      Save
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-5">
                    <label className="text-xs text-[color:var(--sb-muted)] grid gap-1">
                      Type
                      <select name="programType" defaultValue={workspace.programType} className="sb-input h-10 text-sm">
                        <option value="NONE">NONE</option>
                        <option value="DESIGN_PARTNER">DESIGN_PARTNER</option>
                      </select>
                    </label>

                    <label className="text-xs text-[color:var(--sb-muted)] grid gap-1">
                      Status
                      <select name="programStatus" defaultValue={workspace.programStatus} className="sb-input h-10 text-sm">
                        <option value="NONE">NONE</option>
                        <option value="PROSPECT">PROSPECT</option>
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="CHURNED">CHURNED</option>
                      </select>
                    </label>

                    <label className="text-xs text-[color:var(--sb-muted)] grid gap-1">
                      Start date
                      <input
                        type="date"
                        name="programStartedAt"
                        defaultValue={fmtDate(workspace.programStartedAt)}
                        className="sb-input h-10 text-sm"
                      />
                    </label>

                    <label className="text-xs text-[color:var(--sb-muted)] grid gap-1">
                      End date
                      <input
                        type="date"
                        name="programEndedAt"
                        defaultValue={fmtDate(workspace.programEndedAt)}
                        className="sb-input h-10 text-sm"
                      />
                    </label>

                    <label className="text-xs text-[color:var(--sb-muted)] grid gap-1 md:col-span-1">
                      Notes
                      <input
                        type="text"
                        name="programNotes"
                        defaultValue={workspace.programNotes}
                        placeholder="optional"
                        className="sb-input h-10 text-sm"
                      />
                    </label>
                  </div>
                </form>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
