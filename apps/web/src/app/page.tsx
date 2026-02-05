import Link from "next/link";

import SignInButton from "@/components/sign-in-button";

export default function Home() {
  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-4xl px-6 py-14 sm:py-20">
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
          <Link
            href="/dashboard"
            className="text-sm text-[color:var(--sb-muted)] hover:text-[color:var(--sb-fg)] transition-colors"
          >
            Dashboard -&gt;
          </Link>
        </div>

        <div className="mt-12 sb-card p-8 sm:p-10">
          <div className="sb-title text-4xl sm:text-5xl leading-[1.05]">
            Start the day with a pulse that actually helps.
          </div>
          <p className="mt-4 text-[color:var(--sb-muted)] text-lg leading-relaxed max-w-2xl">
            Management sets goals and vision. Starbeam runs nightly research and
            surfaces the right signals, suggested actions, and focus tasks for
            each role. One calm, opinionated update. No dashboard doomscroll.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <SignInButton />
            <Link
              href="/dashboard"
              className="sb-btn px-5 py-3 text-sm font-semibold text-[color:var(--sb-fg)]"
            >
              Preview dashboard
            </Link>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
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
        </div>

        <div className="mt-8 text-xs text-[color:var(--sb-muted)]">
          v0 demo: Google-only, read-only scopes, and a macOS menu bar client.
        </div>
      </div>
    </div>
  );
}
