import Link from "next/link";

import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";
import { supportEmail } from "@/lib/supportEmail";
import { webOrigin } from "@/lib/webOrigin";

export default async function PricingPage() {
  const app = webOrigin();
  const email = supportEmail();

  return (
    <div className="sb-bg">
      <a href="#main" className="sb-skip-link">
        Skip to content
      </a>
      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <SiteHeader appOrigin={app} />

        <main
          id="main"
          className="mt-10 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start"
        >
          <section className="sb-marketing-shell">
            <div className="sb-card p-8 sm:p-10 relative overflow-hidden">
              <div className="sb-orbit" aria-hidden />
              <div className="relative">
                <div className="sb-title text-4xl leading-[1.05] font-extrabold">
                  Pricing
                </div>
                <p className="mt-3 text-[color:var(--sb-muted)] text-lg leading-relaxed max-w-xl">
                  Starbeam is free during private beta. We’re optimizing for real usage, not complicated tiers.
                </p>

                <div className="mt-7 grid gap-4 sm:grid-cols-2">
                  <div className="sb-card-inset p-6">
                    <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                      Private beta
                    </div>
                    <div className="mt-2 sb-title text-3xl font-extrabold">
                      $0
                    </div>
                    <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                      Full access while we iterate. Early teams help shape what “pulse” becomes.
                    </div>
                    <div className="mt-5">
                      <Link
                        href="/waitlist"
                        className="sb-btn sb-btn-primary h-11 px-5 inline-flex items-center text-xs font-extrabold text-[color:var(--sb-fg)]"
                      >
                        Join waitlist
                      </Link>
                    </div>
                  </div>

                  <div className="sb-card-inset p-6">
                    <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                      Coming soon
                    </div>
                    <div className="mt-2 sb-title text-xl font-extrabold">
                      Team plans
                    </div>
                    <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                      Pricing will be simple and team-sized. If you want a notification when it lands, join the waitlist.
                    </div>
                    <div className="mt-5 text-xs text-[color:var(--sb-muted)]">
                      Have needs around SSO/compliance? Email{" "}
                      <a
                        href={`mailto:${email}`}
                        className="text-[color:var(--sb-fg)] hover:underline"
                      >
                        {email}
                      </a>
                      .
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="sb-marketing-shell">
            <div className="sb-card p-7 sm:p-8">
              <div className="sb-title text-xl font-extrabold">What’s included</div>
              <div className="mt-4 grid gap-3 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4">
                  <div className="font-semibold text-[color:var(--sb-fg)]">Pulse</div>
                  <div>Daily cards with “why” and suggested actions.</div>
                </div>
                <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4">
                  <div className="font-semibold text-[color:var(--sb-fg)]">Goals + announcements</div>
                  <div>Founder context that keeps everyone aligned.</div>
                </div>
                <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4">
                  <div className="font-semibold text-[color:var(--sb-fg)]">Cited web research</div>
                  <div>Signals with sources you can verify quickly.</div>
                </div>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-2">
                <Link
                  href="/download"
                  className="sb-btn px-5 py-2.5 text-xs font-semibold text-[color:var(--sb-fg)]"
                >
                  Download macOS app
                </Link>
                <a
                  href={`${app}/login`}
                  className="sb-btn sb-btn-primary px-5 py-2.5 text-xs font-extrabold text-[color:var(--sb-fg)]"
                >
                  Sign in
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
