import Link from "next/link";

export default function SiteFooter({
  appOrigin,
  supportEmail,
  minimal = false,
}: {
  appOrigin: string;
  supportEmail: string;
  minimal?: boolean;
}) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-12 text-xs text-[color:var(--sb-muted)]">
      <div className="sb-card px-6 py-5">
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
          {minimal ? null : (
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/about" className="hover:underline">
                About
              </Link>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
