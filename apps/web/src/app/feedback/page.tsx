import Link from "next/link";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { sbButtonClass } from "@starbeam/shared";

import { submitFeedback } from "@/app/feedback/actions";
import AppShell from "@/components/app-shell";
import { authOptions } from "@/lib/auth";
import { prisma } from "@starbeam/db";

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; source?: string; path?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const sp = await searchParams;

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/feedback")}`);
  }

  const sent = sp.sent === "1";
  const error = sp.error ? String(sp.error) : "";
  const source = sp.source ? String(sp.source) : "web";
  const path = sp.path ? String(sp.path) : "";

  const headerStore = await headers();
  const ua = headerStore.get("user-agent") ?? "";

  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  const inferredSlug = (() => {
    const match = path.match(/^\/w\/([^/]+)/);
    return match ? match[1] : null;
  })();

  const activeMembership = inferredSlug
    ? memberships.find((m) => m.workspace.slug === inferredSlug) ?? null
    : null;

  return (
    <AppShell
      user={{ email: session.user.email ?? "unknown" }}
      workspaces={memberships.map((m) => ({
        slug: m.workspace.slug,
        name: m.workspace.name,
        type: m.workspace.type,
        role: m.role,
      }))}
      activeWorkspace={
        activeMembership
          ? {
              slug: activeMembership.workspace.slug,
              name: activeMembership.workspace.name,
              role: activeMembership.role,
            }
          : null
      }
    >
      <div className="mx-auto max-w-2xl">
        <div className="sb-card p-7 sm:p-8">
          <h2 className="sb-title text-2xl font-extrabold">
            {sent ? "Thanks for the feedback" : "Send feedback"}
          </h2>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            This is an early beta. Send the good, the bad, and the ideas. If you include steps to
            reproduce, we can move much faster.
          </p>

          {sent ? (
            <div className="mt-6 sb-card-inset p-6">
              <div className="sb-title text-lg font-extrabold">We got it.</div>
              <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                Thank you. If you think of anything else, you can{" "}
                <Link href="/feedback" className="text-[color:var(--sb-fg)] hover:underline">
                  send more feedback
                </Link>
                .
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link
                  href="/dashboard"
                  className={sbButtonClass({
                    variant: "primary",
                    className: "h-11 px-6 text-sm font-extrabold",
                  })}
                >
                  Back to dashboard
                </Link>
                <Link
                  href="/feedback"
                  className={sbButtonClass({
                    variant: "secondary",
                    className: "h-11 px-6 text-sm font-semibold",
                  })}
                >
                  Send more
                </Link>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 sb-alert">
              Could not submit feedback ({error}). Try again.
            </div>
          ) : null}

          {sent ? null : (
          <form action={submitFeedback} className="mt-6 grid gap-3">
            <input type="hidden" name="source" value={source} />
            <input type="hidden" name="path" value={path} />
            <input type="hidden" name="userAgent" value={ua} />

            <label className="grid gap-2">
              <div className="text-xs font-extrabold sb-title">Message</div>
              <textarea
                name="message"
                rows={6}
                className="sb-textarea"
                placeholder="What happened? What should happen? Any links or screenshots?"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className={sbButtonClass({
                  variant: "primary",
                  className: "h-11 px-6 text-sm font-extrabold",
                })}
              >
                Send
              </button>
              <Link href="/dashboard" className="text-sm text-[color:var(--sb-muted)] hover:underline">
                Back to dashboard
              </Link>
            </div>
          </form>
          )}
        </div>
      </div>
    </AppShell>
  );
}
