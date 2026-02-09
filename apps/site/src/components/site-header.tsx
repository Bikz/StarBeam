import Link from "next/link";

export default function SiteHeader({ appOrigin }: { appOrigin: string }) {
  return (
    <header className="sb-marketing-shell">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-3"
          aria-label="Starbeam home"
        >
          <div className="sb-card grid h-11 w-11 place-items-center">
            <span className="text-xl sb-title" aria-hidden>
              *
            </span>
          </div>
          <div>
            <div className="sb-title text-xl leading-none">Starbeam</div>
            <div className="text-sm text-[color:var(--sb-muted)]">
              A calm daily pulse for startup teams
            </div>
          </div>
        </Link>

        <nav
          className="flex flex-wrap items-center gap-2"
          aria-label="Primary navigation"
        >
          <Link
            href="/download"
            className="sb-btn px-4 py-2 text-xs font-semibold text-[color:var(--sb-fg)]"
          >
            Download
          </Link>
          <a
            href={`${appOrigin}/login`}
            className="sb-btn px-4 py-2 text-xs font-semibold text-[color:var(--sb-fg)]"
          >
            Sign in
          </a>
          <Link
            href="/waitlist"
            className="sb-btn sb-btn-primary px-4 py-2 text-xs font-extrabold text-[color:var(--sb-fg)]"
          >
            Join waitlist
          </Link>
        </nav>
      </div>
    </header>
  );
}
