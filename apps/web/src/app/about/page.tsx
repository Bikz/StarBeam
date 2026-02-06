import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";
import { isAppHost } from "@/lib/hosts";
import { siteOrigin } from "@/lib/siteOrigin";
import { supportEmail } from "@/lib/supportEmail";
import { webOrigin } from "@/lib/webOrigin";

export default async function AboutPage() {
  const host = (await headers()).get("host");
  if (isAppHost(host)) {
    redirect(`${siteOrigin()}/about`);
  }

  const app = webOrigin();
  const email = supportEmail();

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <SiteHeader appOrigin={app} />

        <main className="mt-10 sb-marketing-shell">
          <div className="sb-card p-8 sm:p-10 relative overflow-hidden">
            <div className="sb-orbit" aria-hidden />
            <div className="relative">
              <div className="sb-title text-4xl leading-[1.05] font-extrabold">
                About Starbeam
              </div>
              <p className="mt-3 text-[color:var(--sb-muted)] text-lg leading-relaxed max-w-2xl">
                Startups lose time to scattered context: a goal doc here, an urgent thread there, a competitor move nobody saw until it was too late.
              </p>

              <div className="mt-7 grid gap-4 sm:grid-cols-3">
                <div className="sb-card-inset p-5">
                  <div className="sb-title text-sm font-extrabold text-[color:var(--sb-fg)]">
                    Calm by design
                  </div>
                  <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                    The default is fewer cards, not more. A pulse is a constraint.
                  </div>
                </div>
                <div className="sb-card-inset p-5">
                  <div className="sb-title text-sm font-extrabold text-[color:var(--sb-fg)]">
                    Context first
                  </div>
                  <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                    Goals and pinned announcements keep the whole team pointed at the same north star.
                  </div>
                </div>
                <div className="sb-card-inset p-5">
                  <div className="sb-title text-sm font-extrabold text-[color:var(--sb-fg)]">
                    Cited signals
                  </div>
                  <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                    Web insights include sources so you can verify quickly and move on.
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-2">
                <Link
                  href="/waitlist"
                  className="sb-btn sb-btn-primary px-6 py-3 text-sm font-extrabold text-[color:var(--sb-fg)]"
                >
                  Join waitlist
                </Link>
                <a
                  href={`${app}/login`}
                  className="sb-btn px-6 py-3 text-sm font-semibold text-[color:var(--sb-fg)]"
                >
                  Sign in
                </a>
                <Link
                  href="/download"
                  className="sb-btn px-6 py-3 text-sm font-semibold text-[color:var(--sb-fg)]"
                >
                  Download macOS app
                </Link>
              </div>

              <div className="mt-6 text-sm text-[color:var(--sb-muted)]">
                Want to talk? Email{" "}
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
        </main>

        <SiteFooter appOrigin={app} supportEmail={email} />
      </div>
    </div>
  );
}

