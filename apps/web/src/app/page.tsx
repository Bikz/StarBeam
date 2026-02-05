import Link from "next/link";
import { getServerSession } from "next-auth";

import SignInButton from "@/components/sign-in-button";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const hasGoogleAuth =
    typeof process.env.GOOGLE_CLIENT_ID === "string" &&
    process.env.GOOGLE_CLIENT_ID.length > 0 &&
    typeof process.env.GOOGLE_CLIENT_SECRET === "string" &&
    process.env.GOOGLE_CLIENT_SECRET.length > 0;

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
        <div className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-3">
            <div className="sb-card grid h-11 w-11 place-items-center">
              <span className="text-xl" aria-hidden>
                *
              </span>
            </div>
            <div>
              <div className="sb-title text-xl leading-none">Starbeam</div>
              <div className="text-sm text-[color:var(--sb-muted)]">
                Enterprise pulse for stronger shared context
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {session?.user?.id ? (
              <>
                <Link
                  href="/dashboard"
                  className="sb-btn px-5 py-3 text-sm font-semibold text-[color:var(--sb-fg)]"
                >
                  Open dashboard
                </Link>
                <Link
                  href="/api/auth/signout?callbackUrl=/"
                  className="text-sm text-[color:var(--sb-muted)] hover:text-[color:var(--sb-fg)] transition-colors"
                >
                  Sign out
                </Link>
              </>
            ) : hasGoogleAuth ? (
              <SignInButton />
            ) : (
              <div className="text-sm text-[color:var(--sb-muted)]">
                Configure Google auth to sign in
              </div>
            )}
          </div>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
          <div className="sb-card p-8 sm:p-10">
            <div className="sb-title text-4xl sm:text-5xl leading-[1.05] font-extrabold">
              Start the day with a pulse that actually helps.
            </div>
            <p className="mt-4 text-[color:var(--sb-muted)] text-lg leading-relaxed max-w-2xl">
              Management sets goals and vision. Starbeam runs nightly research and
              surfaces the right signals, suggested actions, and focus tasks for
              each role. One calm, opinionated update. No dashboard doomscroll.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4">
                <div className="text-sm font-extrabold sb-title">Goals</div>
                <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                  Declare what matters. Stop optimizing for the loudest signal.
                </div>
              </div>
              <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4">
                <div className="text-sm font-extrabold sb-title">Signals</div>
                <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                  Nightly web research with citations. Clear &quot;why&quot; on
                  every card.
                </div>
              </div>
              <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4">
                <div className="text-sm font-extrabold sb-title">Tasks</div>
                <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                  A reverse to-do list: only what truly needs your attention.
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {session?.user?.id ? (
                <Link
                  href="/dashboard"
                  className="sb-btn px-6 py-3.5 text-sm font-extrabold text-[color:var(--sb-fg)]"
                >
                  Continue
                </Link>
              ) : hasGoogleAuth ? (
                <SignInButton />
              ) : (
                <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 px-5 py-3 text-sm text-[color:var(--sb-muted)]">
                  Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to{" "}
                  <code>.env</code>.
                </div>
              )}
              <Link
                href="/dashboard"
                className="sb-btn px-6 py-3.5 text-sm font-semibold text-[color:var(--sb-fg)]"
              >
                Preview dashboard
              </Link>
            </div>
          </div>

          <div className="sb-card p-7">
            <div className="sb-title text-xl font-extrabold">Demo story</div>
            <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
              “CEO sets a Q2 awareness goal. Starbeam notices something overnight. The right person sees it this morning.”
            </p>
            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4">
                <div className="sb-title text-sm font-extrabold">Pinned announcement</div>
                <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                  Brand voice: playful, direct. Focus: Feature X.
                </div>
              </div>
              <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4">
                <div className="sb-title text-sm font-extrabold">Web insight (cited)</div>
                <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                  Reddit + HN chatter aligned with your goal. Suggested action included.
                </div>
              </div>
              <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4">
                <div className="sb-title text-sm font-extrabold">Today’s focus</div>
                <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
                  3–5 Starbeam tasks, derived from email and calendar context.
                </div>
              </div>
            </div>
            <div className="mt-5 text-xs text-[color:var(--sb-muted)] leading-relaxed">
              v0: Google-only (read-only scopes) + web research with citations. macOS menu bar client ships alongside the web dashboard.
            </div>
          </div>
        </div>

        <div className="mt-8 text-xs text-[color:var(--sb-muted)]">
          v0 demo: Google-only, read-only scopes, and a macOS menu bar client.
        </div>
      </div>
    </div>
  );
}
