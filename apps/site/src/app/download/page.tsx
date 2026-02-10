import Link from "next/link";
import Image from "next/image";
import { sbButtonClass } from "@starbeam/shared";

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

        <main id="main" className="mt-12">
          <section className="sb-marketing-shell">
            <div className="sb-card relative overflow-hidden px-8 py-10 sm:px-10 sm:py-12">
              <div className="sb-orbit" aria-hidden />

              <div className="relative mx-auto max-w-2xl text-center">
                <div className="mx-auto mb-6 max-w-[520px]">
                  <Image
                    src="/download/hero.png"
                    alt=""
                    width={1536}
                    height={1024}
                    priority
                    className="h-auto w-full select-none rounded-3xl border border-black/10 dark:border-white/15 bg-white/20 dark:bg-white/5"
                  />
                </div>

                <h1 className="sb-title text-4xl leading-[1.05] font-extrabold sm:text-[44px]">
                  Download Starbeam for macOS
                </h1>
                <p className="mt-3 text-[color:var(--sb-muted)] text-lg leading-relaxed">
                  Let Starbeam do the background thinking for you.
                </p>

                <div className="mt-7 flex justify-center">
                  {dl ? (
                    <a
                      href={dl}
                      className={sbButtonClass({
                        variant: "primary",
                        className: "h-12 px-8 text-sm font-extrabold",
                      })}
                    >
                      Download for macOS
                    </a>
                  ) : (
                    <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 px-5 py-3 text-sm text-[color:var(--sb-muted)] text-left">
                      Download link not configured yet. Set{" "}
                      <code>NEXT_PUBLIC_MACOS_DOWNLOAD_URL</code> (typically a{" "}
                      <code>downloads.starbeamhq.com</code> URL).
                    </div>
                  )}
                </div>

                <div className="mt-4 text-xs text-[color:var(--sb-muted)]">
                  Requirements: {macosMinVersion()}.
                </div>

                <div className="mt-7 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                  Trouble installing? Email{" "}
                  <a
                    href={`mailto:${email}`}
                    className="text-[color:var(--sb-fg)] hover:underline"
                  >
                    {email}
                  </a>
                  .
                </div>

                <div className="mt-4 text-xs text-[color:var(--sb-muted)]">
                  <Link
                    href="/faq"
                    className="text-[color:var(--sb-fg)] hover:underline"
                  >
                    Read FAQ
                  </Link>
                  <span aria-hidden> · </span>
                  <a
                    href={`${app}/login`}
                    className="text-[color:var(--sb-fg)] hover:underline"
                  >
                    Sign in
                  </a>
                </div>
              </div>
            </div>
          </section>
        </main>

        <SiteFooter appOrigin={app} supportEmail={email} />
      </div>
    </div>
  );
}
