import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";
import { isAppHost } from "@/lib/hosts";
import { siteOrigin } from "@/lib/siteOrigin";
import { supportEmail } from "@/lib/supportEmail";
import { webOrigin } from "@/lib/webOrigin";

export default async function ContactPage() {
  const host = (await headers()).get("host");
  if (isAppHost(host)) {
    redirect(`${siteOrigin()}/contact`);
  }

  const app = webOrigin();
  const email = supportEmail();

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <SiteHeader appOrigin={app} />

        <main className="mt-10 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <section className="sb-marketing-shell">
            <div className="sb-card p-8 sm:p-10">
              <div className="sb-title text-4xl leading-[1.05] font-extrabold">
                Contact
              </div>
              <p className="mt-3 text-[color:var(--sb-muted)] text-lg leading-relaxed max-w-2xl">
                Starbeam is in private beta. If you’re trying it, we want to hear what feels noisy, confusing, or genuinely useful.
              </p>

              <div className="mt-7 grid gap-3">
                <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-5">
                  <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                    Email
                  </div>
                  <div className="mt-2">
                    <a
                      href={`mailto:${email}`}
                      className="sb-title text-lg font-extrabold text-[color:var(--sb-fg)] hover:underline"
                    >
                      {email}
                    </a>
                  </div>
                  <div className="mt-2 text-sm text-[color:var(--sb-muted)]">
                    Fastest way to reach us.
                  </div>
                </div>

                <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-5">
                  <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                    Product
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link
                      href="/download"
                      className="sb-btn px-5 py-2.5 text-xs font-semibold text-[color:var(--sb-fg)]"
                    >
                      Download
                    </Link>
                    <Link
                      href="/faq"
                      className="sb-btn px-5 py-2.5 text-xs font-semibold text-[color:var(--sb-fg)]"
                    >
                      FAQ
                    </Link>
                    <Link
                      href="/waitlist"
                      className="sb-btn sb-btn-primary px-5 py-2.5 text-xs font-extrabold text-[color:var(--sb-fg)]"
                    >
                      Join waitlist
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="sb-marketing-shell">
            <div className="sb-card p-7 sm:p-8">
              <div className="sb-title text-xl font-extrabold">
                What to send
              </div>
              <div className="mt-4 grid gap-3 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                <div className="sb-card-inset p-4">
                  <div className="font-semibold text-[color:var(--sb-fg)]">
                    Your org + role
                  </div>
                  <div>Founder, eng lead, marketing, etc.</div>
                </div>
                <div className="sb-card-inset p-4">
                  <div className="font-semibold text-[color:var(--sb-fg)]">
                    What you expected
                  </div>
                  <div>What did you hope the pulse would do for you?</div>
                </div>
                <div className="sb-card-inset p-4">
                  <div className="font-semibold text-[color:var(--sb-fg)]">
                    What felt wrong
                  </div>
                  <div>Noisy cards, missing context, or confusing setup steps.</div>
                </div>
              </div>
            </div>
          </aside>
        </main>

        <SiteFooter appOrigin={app} supportEmail={email} />
      </div>
    </div>
  );
}

