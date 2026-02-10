import Link from "next/link";
import { sbButtonClass } from "@starbeam/shared";

export default function SiteFooter({
  appOrigin,
  supportEmail,
  minimal = false,
  homePromo,
}: {
  appOrigin: string;
  supportEmail: string;
  minimal?: boolean;
  homePromo?: { ctaHref: string };
}) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-12 text-xs text-[color:var(--sb-muted)]">
      <div className="sb-card px-6 py-5">
        {homePromo ? (
          <div className="pb-5 mb-5 border-b border-black/5 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-[260px]">
                <div className="sb-title text-2xl font-extrabold">
                  Get the pulse in your menu bar.
                </div>
                <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed max-w-xl">
                  A calm, cited pulse each morning: what changed, why it
                  matters, and what to do next.
                </p>
              </div>
              <a
                href={homePromo.ctaHref}
                className={sbButtonClass({
                  variant: "primary",
                  className: "shrink-0 px-5 py-2.5 text-xs font-extrabold",
                })}
              >
                Join waitlist
              </a>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="sb-title font-extrabold text-[color:var(--sb-fg)]">
              Starbeam
            </span>
            <span aria-hidden>·</span>
            <span>Private beta</span>
            <span aria-hidden>·</span>
            <a
              href={`mailto:${supportEmail}`}
              className="text-[color:var(--sb-fg)] hover:underline"
            >
              {supportEmail}
            </a>
          </div>

          {minimal ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/privacy" className="hover:underline">
                Privacy
              </Link>
              <span aria-hidden>·</span>
              <Link href="/terms" className="hover:underline">
                Terms
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/about" className="hover:underline">
                About
              </Link>
              <span aria-hidden>·</span>
              <Link href="/download" className="hover:underline">
                Download
              </Link>
              <span aria-hidden>·</span>
              <Link href="/pricing" className="hover:underline">
                Pricing
              </Link>
              <span aria-hidden>·</span>
              <Link href="/faq" className="hover:underline">
                FAQ
              </Link>
              <span aria-hidden>·</span>
              <Link href="/privacy" className="hover:underline">
                Privacy
              </Link>
              <span aria-hidden>·</span>
              <Link href="/terms" className="hover:underline">
                Terms
              </Link>
              <span aria-hidden>·</span>
              <Link href="/contact" className="hover:underline">
                Contact
              </Link>
              <span aria-hidden>·</span>
              <a href={`${appOrigin}/login`} className="hover:underline">
                Sign in
              </a>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>© {year} StarbeamHQ</div>
        </div>
      </div>
    </footer>
  );
}
