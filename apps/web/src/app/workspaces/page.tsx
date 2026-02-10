import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import AppShell from "@/components/app-shell";
import { authOptions } from "@/lib/auth";
import { requireBetaAccessOrRedirect } from "@/lib/betaAccess";

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/workspaces")}`);
  }

  await requireBetaAccessOrRedirect(session.user.id);

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const qLower = q.toLowerCase();

  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  const filtered = qLower
    ? memberships.filter((m) => {
        const name = (m.workspace.name ?? "").toLowerCase();
        const slug = (m.workspace.slug ?? "").toLowerCase();
        return name.includes(qLower) || slug.includes(qLower);
      })
    : memberships;

  return (
    <AppShell
      user={{ email: session.user.email ?? "unknown" }}
      workspaces={memberships.map((m) => ({
        slug: m.workspace.slug,
        name: m.workspace.name,
        type: m.workspace.type,
        role: m.role,
      }))}
      activeWorkspace={null}
    >
      <div className="mx-auto max-w-4xl">
        <div className="sb-card p-7 sm:p-8">
          <h2 className="sb-title text-2xl font-extrabold">All workspaces</h2>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            Switch between workspaces. Use search to quickly jump to the one you
            need.
          </p>

          <form method="get" className="mt-6 grid gap-2">
            <label className="grid gap-1 text-sm">
              <span className="text-[color:var(--sb-muted)]">Search</span>
              <input
                name="q"
                defaultValue={q}
                className="sb-input"
                placeholder="Acme, personal, marketing..."
                autoComplete="off"
              />
            </label>
          </form>

          <div className="mt-7">
            <div className="text-xs font-extrabold sb-title">Results</div>
            {filtered.length === 0 ? (
              <div className="mt-2 sb-alert">No workspaces match “{q}”.</div>
            ) : (
              <div className="mt-3 grid gap-2">
                {filtered.map((m) => (
                  <div key={m.id} className="sb-card-inset px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-[color:var(--sb-fg)] truncate">
                          {m.workspace.name}
                        </div>
                        <div className="mt-0.5 text-xs text-[color:var(--sb-muted)] truncate">
                          /w/{m.workspace.slug} ·{" "}
                          {m.workspace.type.toLowerCase()} ·{" "}
                          {m.role.toLowerCase()}
                        </div>
                      </div>
                      <Link
                        href={`/w/${m.workspace.slug}`}
                        className={sbButtonClass({
                          variant: "primary",
                          className: "h-10 px-4 text-xs font-extrabold",
                        })}
                      >
                        Open
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard"
              className={sbButtonClass({
                variant: "secondary",
                className: "h-11 px-5 text-sm font-extrabold",
              })}
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
