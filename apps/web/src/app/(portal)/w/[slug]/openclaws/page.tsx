import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import PageHeader from "@/components/page-header";
import CopyPill from "@/components/copy-pill";
import { authOptions } from "@/lib/auth";
import SetupPromptCopyButton from "@/app/(portal)/w/[slug]/openclaws/SetupPromptCopyButton";
import {
  createOpenClawAgent,
  deleteOpenClawAgent,
  queueOpenClawCommand,
  updateOpenClawAgent,
} from "@/app/(portal)/w/[slug]/openclaws/actions";

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

function statusLabel(args: {
  status: string;
  lastSeenAt?: Date | null;
  now: Date;
}) {
  const isFresh =
    args.lastSeenAt &&
    args.now.getTime() - args.lastSeenAt.getTime() < 2 * 60 * 1000;
  if (isFresh) return { label: "online", tone: "fresh" as const };
  if (args.lastSeenAt) return { label: "offline", tone: "stale" as const };
  return { label: "never connected", tone: "never" as const };
}

export default async function OpenClawsPage({
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

  const openclaws = await prisma.openClawAgent.findMany({
    where: {
      workspaceId: membership.workspace.id,
      createdByUserId: session.user.id,
    },
    include: {
      commands: {
        orderBy: { createdAt: "desc" },
        take: 8,
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const now = new Date();

  return (
    <div className="grid gap-6">
      <div className="sb-card p-7">
        <PageHeader
          title="OpenClaws"
          description={
            <>
              Attach one or more OpenClaw instances to this workspace. Starbeam
              can queue briefs or autopilot tasks for each OpenClaw, based on
              its role.{" "}
              <span className="font-semibold">
                Two-way sync is coming soon.
              </span>
            </>
          }
        />

        <div className="mt-5 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="sb-card-inset p-4">
            <div className="text-xs font-extrabold sb-title">v1 (one-way)</div>
            <div className="mt-1 text-sm text-[color:var(--sb-muted)] leading-relaxed">
              Starbeam queues commands; your OpenClaw polls and executes them.
            </div>
          </div>

          <div className="sb-card-inset p-4">
            <div className="text-xs font-extrabold sb-title">
              v2 (coming soon)
            </div>
            <div className="mt-1 text-sm text-[color:var(--sb-muted)] leading-relaxed">
              Two-way sync toggle: let OpenClaw share relevant context back to
              Starbeam so pulses get smarter.
            </div>
          </div>
        </div>
      </div>

      <div className="sb-card p-7">
        <PageHeader
          title="Add an OpenClaw"
          description="Give each OpenClaw a role so Starbeam can tailor what it sends."
        />

        <form
          action={createOpenClawAgent.bind(null, membership.workspace.slug)}
          className="mt-5 grid gap-3"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-[color:var(--sb-muted)]">Name</span>
              <input
                name="name"
                placeholder="Marketing Claw"
                spellCheck={false}
                className="sb-input"
                required
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-[color:var(--sb-muted)]">Default mode</span>
              <select name="mode" className="sb-select" defaultValue="BRIEF">
                <option value="BRIEF">Brief (queue context only)</option>
                <option value="AUTOPILOT">Autopilot (run tasks)</option>
              </select>
            </label>
          </div>

          <label className="grid gap-1 text-sm">
            <span className="text-[color:var(--sb-muted)]">Role title</span>
            <input
              name="roleTitle"
              placeholder="Marketing specialist"
              spellCheck={false}
              className="sb-input"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-[color:var(--sb-muted)]">
              Responsibilities
            </span>
            <textarea
              name="responsibilities"
              placeholder="What is this OpenClaw responsible for?"
              className="sb-input min-h-[92px]"
            />
          </label>

          <button
            type="submit"
            className={sbButtonClass({
              variant: "primary",
              className: "h-11 px-5 text-sm font-extrabold justify-self-start",
            })}
          >
            Create OpenClaw
          </button>
        </form>
      </div>

      <div className="grid gap-6">
        {openclaws.length === 0 ? (
          <div className="sb-card p-7">
            <PageHeader
              title="No OpenClaws yet"
              description="Create your first OpenClaw above, then copy the setup prompt and share it with your OpenClaw."
            />
          </div>
        ) : null}

        {openclaws.map((c) => {
          const freshness = statusLabel({
            status: c.status,
            lastSeenAt: c.lastSeenAt,
            now,
          });
          const lastSeenLabel = c.lastSeenAt
            ? `Last seen ${relativeTime(c.lastSeenAt, now)}`
            : "No heartbeats yet";

          const pillTone =
            freshness.tone === "fresh"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
              : freshness.tone === "stale"
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"
                : "bg-black/5 text-[color:var(--sb-muted)] border-black/10 dark:bg-white/5 dark:border-white/10";

          return (
            <div key={c.id} className="sb-card p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="sb-title text-xl font-extrabold">
                      {c.name}
                    </div>
                    <div className={["sb-pill border", pillTone].join(" ")}>
                      {freshness.label}
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                    {lastSeenLabel}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <CopyPill
                      value={c.id}
                      label={`${c.id.slice(0, 8)}…`}
                      title="Click to copy OpenClaw ID"
                    />
                    <div className="sb-pill">
                      {c.mode === "AUTOPILOT" ? "autopilot" : "brief"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <SetupPromptCopyButton
                    workspaceSlug={membership.workspace.slug}
                    openclawAgentId={c.id}
                  />

                  <form
                    action={deleteOpenClawAgent.bind(
                      null,
                      membership.workspace.slug,
                      c.id,
                    )}
                  >
                    <button
                      type="submit"
                      className={sbButtonClass({
                        variant: "secondary",
                        className: "h-10 px-4 text-xs font-semibold",
                      })}
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>

              <form
                action={updateOpenClawAgent.bind(
                  null,
                  membership.workspace.slug,
                  c.id,
                )}
                className="mt-6 grid gap-3"
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="text-[color:var(--sb-muted)]">Name</span>
                    <input
                      name="name"
                      defaultValue={c.name}
                      className="sb-input"
                      required
                    />
                  </label>

                  <label className="grid gap-1 text-sm">
                    <span className="text-[color:var(--sb-muted)]">
                      Default mode
                    </span>
                    <select
                      name="mode"
                      className="sb-select"
                      defaultValue={c.mode}
                    >
                      <option value="BRIEF">Brief (queue context only)</option>
                      <option value="AUTOPILOT">Autopilot (run tasks)</option>
                    </select>
                  </label>
                </div>

                <label className="grid gap-1 text-sm">
                  <span className="text-[color:var(--sb-muted)]">
                    Role title
                  </span>
                  <input
                    name="roleTitle"
                    defaultValue={c.roleTitle ?? ""}
                    placeholder="Marketing specialist"
                    spellCheck={false}
                    className="sb-input"
                  />
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="text-[color:var(--sb-muted)]">
                    Responsibilities
                  </span>
                  <textarea
                    name="responsibilities"
                    defaultValue={c.responsibilities ?? ""}
                    className="sb-input min-h-[92px]"
                  />
                </label>

                <button
                  type="submit"
                  className={sbButtonClass({
                    variant: "secondary",
                    className:
                      "h-10 px-4 text-xs font-semibold justify-self-start",
                  })}
                >
                  Save details
                </button>
              </form>

              <div className="mt-7 grid gap-4 lg:grid-cols-[1fr_1fr]">
                <div className="sb-card-inset p-4">
                  <div className="text-xs font-extrabold sb-title">
                    Queue a message
                  </div>
                  <div className="mt-1 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                    {c.mode === "AUTOPILOT"
                      ? "Autopilot will run this as a task."
                      : "Brief will be stored as context for later."}
                  </div>

                  <form
                    action={queueOpenClawCommand.bind(
                      null,
                      membership.workspace.slug,
                      c.id,
                    )}
                    className="mt-3 grid gap-3"
                  >
                    <textarea
                      name="message"
                      placeholder={
                        c.mode === "AUTOPILOT"
                          ? "Task for OpenClaw…"
                          : "Brief/context for OpenClaw…"
                      }
                      className="sb-input min-h-[110px]"
                      required
                    />
                    <button
                      type="submit"
                      className={sbButtonClass({
                        variant: "primary",
                        className:
                          "h-10 px-4 text-xs font-extrabold justify-self-start",
                      })}
                    >
                      {c.mode === "AUTOPILOT" ? "Queue task" : "Queue brief"}
                    </button>
                  </form>
                </div>

                <div className="sb-card-inset p-4">
                  <div className="text-xs font-extrabold sb-title">
                    Recent commands
                  </div>
                  {c.commands.length === 0 ? (
                    <div className="mt-2 text-sm text-[color:var(--sb-muted)]">
                      No commands yet.
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      {c.commands.map((cmd) => (
                        <div
                          key={cmd.id}
                          className="sb-card-inset px-3 py-2 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-mono text-[color:var(--sb-muted)]">
                              {cmd.id.slice(0, 8)}…
                            </div>
                            <div className="sb-pill">
                              {cmd.type.toLowerCase()} ·{" "}
                              {cmd.state.toLowerCase()}
                            </div>
                          </div>
                          <div className="mt-1 text-[color:var(--sb-muted)]">
                            {relativeTime(cmd.createdAt, now)}
                            {cmd.finishedAt
                              ? ` · finished ${relativeTime(cmd.finishedAt, now)}`
                              : ""}
                          </div>
                          {cmd.errorSummary ? (
                            <div className="mt-2 text-[color:var(--sb-muted)] break-words">
                              {cmd.errorSummary}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
