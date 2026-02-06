import Link from "next/link";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { isAppHost } from "@/lib/hosts";
import { webOrigin } from "@/lib/webOrigin";
import { joinWaitlist } from "@/app/waitlist/actions";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import { supportEmail } from "@/lib/supportEmail";

export default async function Home() {
  const host = (await headers()).get("host");

  // app.starbeamHQ.com: login-first entry.
  if (isAppHost(host)) {
    const session = await getServerSession(authOptions);
    if (session?.user?.id) redirect("/dashboard");
    redirect("/login");
  }

  const app = webOrigin();
  const email = supportEmail();

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <SiteHeader appOrigin={app} />

        <main className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <section className="sb-marketing-shell">
            <div className="sb-card p-8 sm:p-10 relative overflow-hidden">
              <div className="sb-orbit" aria-hidden />

              <div className="relative">
                <div className="inline-flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                  <span className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-3 py-1">
                    Nightly web research (cited)
                  </span>
                  <span className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-3 py-1">
                    Goals + announcements
                  </span>
                  <span className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-3 py-1">
                    Read-only Google (v0)
                  </span>
                </div>

                <h1 className="mt-5 sb-title text-4xl sm:text-5xl leading-[1.03] font-extrabold">
                  Wake up to the <span className="underline decoration-black/15 dark:decoration-white/20 underline-offset-4">few things</span>{" "}
                  your startup should care about today.
                </h1>
                <p className="mt-4 text-[color:var(--sb-muted)] text-lg leading-relaxed max-w-xl">
                  Founders set context once. Starbeam runs overnight and delivers a calm, opinionated pulse: what changed, why it matters, and what to do next.
                </p>

                <form action={joinWaitlist} className="mt-7 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="grid gap-1 text-sm">
                    <span className="text-[color:var(--sb-muted)]">Email</span>
                    <input
                      name="email"
                      type="email"
                      placeholder="you@company.com"
                      className="h-12 rounded-2xl border border-black/10 dark:border-white/15 bg-white/55 dark:bg-white/10 px-4 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
                      required
                    />
                  </label>
                  <input type="hidden" name="ref" value="" />
                  <button
                    type="submit"
                    className="sb-btn sb-btn-primary h-12 px-6 text-sm font-extrabold text-[color:var(--sb-fg)]"
                  >
                    Join waitlist
                  </button>
                </form>

                <div className="mt-3 text-xs text-[color:var(--sb-muted)] leading-relaxed">
                  Private beta. No spam. If you already joined, you’ll see your referral link.
                </div>

                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  <div className="sb-card-inset p-4">
                    <div className="sb-title text-sm font-extrabold">Goals</div>
                    <div className="mt-1 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                      Declare what matters so the pulse stays quiet and relevant.
                    </div>
                  </div>
                  <div className="sb-card-inset p-4">
                    <div className="sb-title text-sm font-extrabold">Signals</div>
                    <div className="mt-1 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                      Overnight web research with citations and clear “why”.
                    </div>
                  </div>
                  <div className="sb-card-inset p-4">
                    <div className="sb-title text-sm font-extrabold">Focus</div>
                    <div className="mt-1 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                      A short list of what actually needs attention today.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="sb-card p-6">
                <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                  Built for
                </div>
                <div className="mt-2 sb-title text-lg font-extrabold">
                  5–50 person teams
                </div>
                <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                  Founder-led context, role-aware delivery, and minimal setup.
                </div>
              </div>
              <div className="sb-card p-6">
                <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                  Not another
                </div>
                <div className="mt-2 sb-title text-lg font-extrabold">
                  dashboard
                </div>
                <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                  Starbeam is a daily digest, not a place to scroll for hours.
                </div>
              </div>
              <div className="sb-card p-6">
                <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                  v0 shipping with
                </div>
                <div className="mt-2 sb-title text-lg font-extrabold">
                  citations + read-only
                </div>
                <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                  Every web insight explains where it came from and why it matters.
                </div>
              </div>
            </div>
          </section>

          <aside className="sb-marketing-shell">
            <div className="sb-card p-7 sm:p-8 relative overflow-hidden">
              <div className="sb-title text-xl font-extrabold">
                Pulse preview
              </div>
              <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                The “morning update” you actually read. Short cards, clear reasons, cited sources.
              </p>

              <div className="mt-6 grid gap-3">
                <div className="sb-card-inset p-5 sb-float" style={{ animationDelay: "0ms" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="sb-title text-sm font-extrabold">
                        🔔 Pinned: Q2 focus
                      </div>
                      <div className="mt-1 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                        Ship onboarding improvements. Measure activation, not clicks.
                      </div>
                    </div>
                    <div className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-[color:var(--sb-muted)]">
                      announcement
                    </div>
                  </div>
                </div>

                <div className="sb-card-inset p-5 sb-float" style={{ animationDelay: "900ms" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="sb-title text-sm font-extrabold">
                        🚀 Signal: competitor pricing shift
                      </div>
                      <div className="mt-1 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                        New bundle spotted in the last 48h. Suggested response included.
                      </div>
                      <div className="mt-3 text-xs text-[color:var(--sb-muted)]">
                        Sources: 2
                      </div>
                    </div>
                    <div className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-[color:var(--sb-muted)]">
                      cited
                    </div>
                  </div>
                </div>

                <div className="sb-card-inset p-5 sb-float" style={{ animationDelay: "1600ms" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="sb-title text-sm font-extrabold">
                        ✅ Today’s focus (3)
                      </div>
                      <div className="mt-1 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                        Follow up with 2 high-intent threads. Prep talking points for the 2pm call.
                      </div>
                    </div>
                    <div className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-[color:var(--sb-muted)]">
                      tasks
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-7 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-5">
                <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                  How it works
                </div>
                <ol className="mt-3 grid gap-3 text-sm text-[color:var(--sb-muted)]">
                  <li className="flex gap-3">
                    <div className="mt-0.5 h-6 w-6 flex-none rounded-full bg-black/5 dark:bg-white/10 grid place-items-center border border-black/10 dark:border-white/15">
                      <span className="text-xs font-extrabold text-[color:var(--sb-fg)]">
                        1
                      </span>
                    </div>
                    <div>
                      Set goals and a pinned announcement so everyone shares the same north star.
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <div className="mt-0.5 h-6 w-6 flex-none rounded-full bg-black/5 dark:bg-white/10 grid place-items-center border border-black/10 dark:border-white/15">
                      <span className="text-xs font-extrabold text-[color:var(--sb-fg)]">
                        2
                      </span>
                    </div>
                    <div>
                      Starbeam runs overnight research and ranks signals against your context.
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <div className="mt-0.5 h-6 w-6 flex-none rounded-full bg-black/5 dark:bg-white/10 grid place-items-center border border-black/10 dark:border-white/15">
                      <span className="text-xs font-extrabold text-[color:var(--sb-fg)]">
                        3
                      </span>
                    </div>
                    <div>
                      Your team starts the day aligned, without opening 7 tabs.
                    </div>
                  </li>
                </ol>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <Link
                  href="/waitlist"
                  className="sb-btn sb-btn-primary px-5 py-2.5 text-xs font-extrabold text-[color:var(--sb-fg)]"
                >
                  Join waitlist
                </Link>
                <a
                  href={`${app}/login`}
                  className="sb-btn px-5 py-2.5 text-xs font-semibold text-[color:var(--sb-fg)]"
                >
                  Open app
                </a>
              </div>
            </div>
          </aside>
        </main>

        <SiteFooter appOrigin={app} supportEmail={email} />
      </div>
    </div>
  );
}
