import Link from "next/link";

import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";
import { macosDownloadUrl, macosMinVersion } from "@/lib/macosDownload";
import { supportEmail } from "@/lib/supportEmail";
import { webOrigin } from "@/lib/webOrigin";

export default async function DownloadPage() {
  const app = webOrigin();
  const email = supportEmail();
  const dl = macosDownloadUrl();

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
                  Download Starbeam for macOS
                </div>
                <p className="mt-3 text-[color:var(--sb-muted)] text-lg leading-relaxed max-w-xl">
                  The menu bar pulse for founders and teams. One calm update. No doomscroll.
                </p>

                <div className="mt-7 flex flex-wrap items-center gap-3">
                  {dl ? (
                    <a
                      href={dl}
                      className="sb-btn sb-btn-primary h-12 px-6 inline-flex items-center text-sm font-extrabold text-[color:var(--sb-fg)]"
                    >
                      Download for macOS
                    </a>
                  ) : (
                    <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 px-5 py-3 text-sm text-[color:var(--sb-muted)]">
                      Download link not configured yet. Set{" "}
                      <code>NEXT_PUBLIC_MACOS_DOWNLOAD_URL</code> (typically a{" "}
                      <code>downloads.starbeamhq.com</code> URL).
                    </div>
                  )}
                  <a
                    href={`${app}/login`}
                    className="sb-btn h-12 px-6 inline-flex items-center text-sm font-semibold text-[color:var(--sb-fg)]"
                  >
                    Sign in to connect your org
                  </a>
                </div>

                <div className="mt-4 text-xs text-[color:var(--sb-muted)]">
                  Requirements: {macosMinVersion()}.
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="sb-card p-6">
                <div className="sb-title text-lg font-extrabold">Fast</div>
                <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                  Menu bar delivery and quick reads. Designed to be done in minutes.
                </div>
              </div>
              <div className="sb-card p-6">
                <div className="sb-title text-lg font-extrabold">Cited</div>
                <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                  Web insights include sources so you can verify quickly.
                </div>
              </div>
              <div className="sb-card p-6">
                <div className="sb-title text-lg font-extrabold">Calm</div>
                <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                  Goals and pinned context reduce noise across the team.
                </div>
              </div>
            </div>
          </section>

          <aside className="sb-marketing-shell">
            <div className="sb-card p-7 sm:p-8">
              <div className="sb-title text-xl font-extrabold">
                Install in 3 steps
              </div>
              <ol className="mt-4 grid gap-3 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                <li className="flex gap-3">
                  <div className="mt-0.5 h-6 w-6 flex-none rounded-full bg-black/5 dark:bg-white/10 grid place-items-center border border-black/10 dark:border-white/15">
                    <span className="text-xs font-extrabold text-[color:var(--sb-fg)]">
                      1
                    </span>
                  </div>
                  <div>Download and move Starbeam into Applications.</div>
                </li>
                <li className="flex gap-3">
                  <div className="mt-0.5 h-6 w-6 flex-none rounded-full bg-black/5 dark:bg-white/10 grid place-items-center border border-black/10 dark:border-white/15">
                    <span className="text-xs font-extrabold text-[color:var(--sb-fg)]">
                      2
                    </span>
                  </div>
                  <div>Open Starbeam and approve sign-in in your browser.</div>
                </li>
                <li className="flex gap-3">
                  <div className="mt-0.5 h-6 w-6 flex-none rounded-full bg-black/5 dark:border-white/15 dark:bg-white/10 grid place-items-center border border-black/10">
                    <span className="text-xs font-extrabold text-[color:var(--sb-fg)]">
                      3
                    </span>
                  </div>
                  <div>Set goals and announcements once. Wake up aligned.</div>
                </li>
              </ol>

              <div className="mt-7 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-5">
                <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                  Trouble installing?
                </div>
                <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                  Email{" "}
                  <a
                    href={`mailto:${email}`}
                    className="text-[color:var(--sb-fg)] hover:underline"
                  >
                    {email}
                  </a>{" "}
                  and we’ll help.
                </div>
              </div>

              <div className="mt-7 flex flex-wrap gap-2">
                <Link
                  href="/faq"
                  className="sb-btn px-5 py-2.5 text-xs font-semibold text-[color:var(--sb-fg)]"
                >
                  Read FAQ
                </Link>
                <Link
                  href="/waitlist"
                  className="sb-btn sb-btn-primary px-5 py-2.5 text-xs font-extrabold text-[color:var(--sb-fg)]"
                >
                  Join waitlist
                </Link>
              </div>
            </div>
          </aside>
        </main>

        <SiteFooter appOrigin={app} supportEmail={email} />
      </div>
    </div>
  );
}
