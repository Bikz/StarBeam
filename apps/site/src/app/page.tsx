import type { Metadata } from "next";
import Image from "next/image";
import { sbButtonClass } from "@starbeam/shared";

import { siteOrigin } from "@/lib/siteOrigin";
import { supportEmail } from "@/lib/supportEmail";
import { webOrigin } from "@/lib/webOrigin";
import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: "Starbeam | Daily pulse for startup teams",
  description:
    "A calm, cited daily pulse for startup founders and teams. Set context once. Starbeam runs overnight and delivers what changed, why it matters, and what to do next.",
  openGraph: {
    title: "Starbeam | Daily pulse for startup teams",
    description:
      "Set context once. Starbeam runs overnight and delivers a calm, cited pulse: what changed, why it matters, and what to do next.",
    url: "/",
    siteName: "Starbeam",
    images: [
      {
        url: "/og/og.png",
        width: 1200,
        height: 630,
        alt: "Starbeam: daily pulse for startup teams",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Starbeam | Daily pulse for startup teams",
    description:
      "A calm, cited daily pulse for startup founders and teams. What changed, why it matters, what to do next.",
    images: ["/og/og.png"],
  },
};

export default async function Home({
  searchParams,
}: {
  searchParams?: { ref?: string | string[]; error?: string | string[] };
}) {
  const app = webOrigin();
  const email = supportEmail();
  const ref =
    typeof searchParams?.ref === "string" ? searchParams?.ref.trim() : "";
  const error =
    typeof searchParams?.error === "string" ? searchParams?.error.trim() : "";

  return (
    <div className="sb-bg">
      <a href="#main" className="sb-skip-link">
        Skip to content
      </a>
      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <SiteHeader appOrigin={app} home />

        <main id="main" className="mt-10">
          <section className="sb-marketing-shell">
            <div className="sb-card relative overflow-hidden px-8 py-10 sm:px-10 sm:py-12">
              <div className="sb-orbit" aria-hidden />

              <div className="relative grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
                <div>
                  <div className="inline-flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                    <span className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-3 py-1">
                      Overnight, cited research
                    </span>
                    <span className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-3 py-1">
                      Calm by default
                    </span>
                    <span className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-3 py-1">
                      Built for startups
                    </span>
                  </div>

                  <h1 className="mt-5 sb-title text-[42px] leading-[1.02] sm:text-[56px] font-extrabold">
                    Your team’s attention,
                    <br />
                    delivered once a day.
                  </h1>
                  <p className="mt-4 text-[color:var(--sb-muted)] text-lg leading-relaxed max-w-xl">
                    Set context once. Starbeam runs overnight and delivers a
                    calm, cited pulse: what changed, why it matters, and what to
                    do next.
                  </p>

                  <form
                    id="waitlist"
                    action={`${app}/login`}
                    method="GET"
                    className="mt-7 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
                  >
                    <label className="grid gap-1 text-sm">
                      <span className="text-[color:var(--sb-muted)]">
                        Work email
                      </span>
                      <input
                        name="email"
                        type="email"
                        placeholder="you@company.com…"
                        autoComplete="email"
                        spellCheck={false}
                        className="h-12 rounded-2xl border border-black/10 dark:border-white/15 bg-white/55 dark:bg-white/10 px-4 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
                        required
                      />
                    </label>
                    <input type="hidden" name="mode" value="waitlist" />
                    <input type="hidden" name="ref" value={ref} />
                    <input type="hidden" name="callbackUrl" value="/beta" />
                    <button
                      type="submit"
                      className={sbButtonClass({
                        variant: "primary",
                        className: "h-12 px-6 text-sm font-extrabold",
                      })}
                    >
                      Join the waitlist
                    </button>
                  </form>

                  {error ? (
                    <div role="alert" className="mt-4 sb-alert">
                      <strong>Couldn’t join the waitlist.</strong>{" "}
                      {error === "invalid_email"
                        ? "Please enter a valid email address."
                        : "Please try again."}
                    </div>
                  ) : null}

                  <div className="mt-3 text-xs text-[color:var(--sb-muted)] leading-relaxed">
                    Private beta. No spam. Already joined? You’ll see your
                    referral link.
                  </div>

                  <div className="mt-3 text-xs text-[color:var(--sb-muted)] leading-relaxed">
                    Already invited?{" "}
                    <a
                      href={`${app}/login`}
                      className="font-semibold text-[color:var(--sb-fg)] hover:underline"
                    >
                      Sign in
                    </a>
                    .
                  </div>
                </div>

                <div className="relative">
                  <div className="pointer-events-none absolute -inset-6 rounded-[30px] bg-[radial-gradient(600px_420px_at_40%_40%,rgba(0,0,0,0.08),transparent_60%)] dark:bg-[radial-gradient(600px_420px_at_40%_40%,rgba(255,255,255,0.10),transparent_60%)]" />
                  <div className="sb-card-inset relative overflow-hidden rounded-[26px] p-4">
                    <Image
                      src="/landing/v2/hero.png"
                      alt="Starbeam delivers a daily pulse in the macOS menu bar."
                      width={1536}
                      height={1024}
                      priority
                      className="sb-img-soft h-auto w-full rounded-[20px] sb-hero-fade"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="sb-card p-6">
              <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                For
              </div>
              <div className="mt-2 sb-title text-lg font-extrabold">
                founders + leads
              </div>
              <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                Reduce noise and keep momentum without turning your day into
                research.
              </div>
            </div>
            <div className="sb-card p-6">
              <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                Built for
              </div>
              <div className="mt-2 sb-title text-lg font-extrabold">
                5–50 person teams
              </div>
              <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                Share goals and announcements so your pulse stays relevant for
                everyone.
              </div>
            </div>
            <div className="sb-card p-6">
              <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                With
              </div>
              <div className="mt-2 sb-title text-lg font-extrabold">
                citations by default
              </div>
              <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                Every web insight includes sources so you can verify quickly.
              </div>
            </div>
          </section>

          <section className="mt-10 grid gap-8 lg:grid-cols-2 lg:items-center">
            <div className="sb-marketing-shell">
              <div className="sb-card p-7 sm:p-8">
                <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                  How it works
                </div>
                <div className="mt-2 sb-title text-2xl font-extrabold">
                  Set context once. Wake up aligned.
                </div>
                <ol className="mt-5 grid gap-3 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                  <li className="flex gap-3">
                    <div className="mt-0.5 h-6 w-6 flex-none rounded-full bg-black/5 dark:bg-white/10 grid place-items-center border border-black/10 dark:border-white/15">
                      <span className="text-xs font-extrabold text-[color:var(--sb-fg)]">
                        1
                      </span>
                    </div>
                    <div>
                      Sign in, connect a tool, and add a little context
                      (optional).
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <div className="mt-0.5 h-6 w-6 flex-none rounded-full bg-black/5 dark:bg-white/10 grid place-items-center border border-black/10 dark:border-white/15">
                      <span className="text-xs font-extrabold text-[color:var(--sb-fg)]">
                        2
                      </span>
                    </div>
                    <div>
                      Starbeam “dreams” overnight: research, summaries, and
                      citations.
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <div className="mt-0.5 h-6 w-6 flex-none rounded-full bg-black/5 dark:border-white/15 dark:bg-white/10 grid place-items-center border border-black/10">
                      <span className="text-xs font-extrabold text-[color:var(--sb-fg)]">
                        3
                      </span>
                    </div>
                    <div>
                      You start the day with a short list of what to do next.
                    </div>
                  </li>
                </ol>
                <div className="mt-7 flex flex-wrap items-center gap-4">
                  <a
                    href="/faq"
                    className="text-xs font-semibold text-[color:var(--sb-muted)] hover:text-[color:var(--sb-fg)] hover:underline"
                  >
                    Read FAQ
                  </a>
                </div>
              </div>
            </div>

            <div className="sb-marketing-shell">
              <div className="sb-card-inset overflow-hidden rounded-[26px] p-4">
                <Image
                  src="/landing/v2/how.png"
                  alt="Cited research distilled into a calm daily pulse."
                  width={1536}
                  height={1024}
                  className="sb-img-soft h-auto w-full rounded-[20px]"
                />
              </div>
            </div>
          </section>

          {/* Home-only promo CTA lives in the footer. */}
        </main>

        <SiteFooter
          appOrigin={app}
          supportEmail={email}
          homePromo={{ ctaHref: "#waitlist" }}
        />
      </div>
    </div>
  );
}
