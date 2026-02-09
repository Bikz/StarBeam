import Link from "next/link";
import { sbButtonClass } from "@starbeam/shared";

import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";
import { supportEmail } from "@/lib/supportEmail";
import { webOrigin } from "@/lib/webOrigin";

function QA({
  q,
  children,
}: {
  q: string;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-5">
      <summary className="cursor-pointer select-none sb-title text-base font-extrabold">
        {q}
      </summary>
      <div className="mt-3 text-sm text-[color:var(--sb-muted)] leading-relaxed">
        {children}
      </div>
    </details>
  );
}

export default async function FAQPage() {
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
            <div className="sb-card p-8 sm:p-10">
              <div className="sb-title text-4xl leading-[1.05] font-extrabold">
                FAQ
              </div>
              <p className="mt-3 text-[color:var(--sb-muted)] text-lg leading-relaxed max-w-2xl">
                The product is early. The philosophy is not: keep the pulse calm, cited, and aligned with your goals.
              </p>

              <div className="mt-7 grid gap-3">
                <QA q="What is Starbeam?">
                  Starbeam delivers a daily pulse for your org: a short, role-aware update built from your goals, announcements, connected tools, and nightly web research with citations.
                </QA>
                <QA q="Is this meant for enterprises?">
                  We’re focused on startup teams (roughly 5–50 people) first. The product shape is “founder context → team pulse”, not a massive admin console.
                </QA>
                <QA q="What does the macOS app do?">
                  It lives in the menu bar and shows the latest pulse, today’s focus items, and calendar highlights. The web app is where you set goals, announcements, and integrations.
                </QA>
                <QA q="How does Google integration work?">
                  v0 uses read-only scopes. Starbeam does not send emails or write calendar events. Tokens are stored encrypted.
                </QA>
                <QA q="Do web insights have sources?">
                  Yes. Web-research cards include citations so you can verify quickly. The goal is “trust by default, verify instantly”.
                </QA>
                <QA q="Pricing?">
                  Free during private beta. See{" "}
                  <Link href="/pricing" className="text-[color:var(--sb-fg)] hover:underline">
                    pricing
                  </Link>
                  .
                </QA>
                <QA q="How do I get access?">
                  Join the{" "}
                  <Link href="/waitlist" className="text-[color:var(--sb-fg)] hover:underline">
                    waitlist
                  </Link>{" "}
                  and we’ll email you as access opens up.
                </QA>
              </div>
            </div>
          </section>

          <aside className="sb-marketing-shell">
            <div className="sb-card p-7 sm:p-8">
              <div className="sb-title text-xl font-extrabold">Quick links</div>
              <div className="mt-4 grid gap-2 text-sm">
                <Link
                  href="/download"
                  className={sbButtonClass({
                    variant: "secondary",
                    className: "px-5 py-2.5 text-xs font-semibold",
                  })}
                >
                  Download macOS app
                </Link>
                <Link
                  href="/waitlist"
                  className={sbButtonClass({
                    variant: "primary",
                    className: "px-5 py-2.5 text-xs font-extrabold",
                  })}
                >
                  Join waitlist
                </Link>
                <a
                  href={`${app}/login`}
                  className={sbButtonClass({
                    variant: "ghost",
                    className: "px-5 py-2.5 text-xs font-semibold",
                  })}
                >
                  Sign in
                </a>
              </div>

              <div className="mt-7 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-5 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                Questions? Email{" "}
                <a href={`mailto:${email}`} className="text-[color:var(--sb-fg)] hover:underline">
                  {email}
                </a>
                .
              </div>
            </div>
          </aside>
        </main>

        <SiteFooter appOrigin={app} supportEmail={email} />
      </div>
    </div>
  );
}
