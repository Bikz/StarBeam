import Link from "next/link";
import Image from "next/image";
import { sbButtonClass } from "@starbeam/shared";

export default function SiteHeader({
  appOrigin,
  minimal = false,
  home = false,
}: {
  appOrigin: string;
  minimal?: boolean;
  home?: boolean;
}) {
  return (
    <header className="sb-marketing-shell">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-3"
          aria-label="Starbeam home"
        >
          <div className="sb-card grid h-11 w-11 place-items-center">
            <Image
              src="/brand/starbeam-logo-light.png"
              alt=""
              width={34}
              height={34}
              unoptimized
              priority
              className="block dark:hidden"
            />
            <Image
              src="/brand/starbeam-logo-dark.png"
              alt=""
              width={34}
              height={34}
              unoptimized
              priority
              className="hidden dark:block"
            />
          </div>
          <div>
            <div className="sb-title text-xl leading-none">Starbeam</div>
            <div className="text-sm text-[color:var(--sb-muted)]">
              A calm daily pulse for startup teams
            </div>
          </div>
        </Link>

        {minimal ? null : (
          <nav
            className="flex flex-wrap items-center gap-2"
            aria-label="Primary navigation"
          >
            {home ? (
              <>
                <Link
                  href="/download"
                  className={sbButtonClass({
                    variant: "ghost",
                    className: "px-4 py-2 text-xs font-semibold",
                  })}
                >
                  Download
                </Link>
                <a
                  href={`${appOrigin}/login`}
                  className={sbButtonClass({
                    variant: "ghost",
                    className: "px-4 py-2 text-xs font-semibold",
                  })}
                >
                  Sign in
                </a>
                <Link
                  href="/#waitlist"
                  className={sbButtonClass({
                    variant: "primary",
                    className: "px-4 py-2 text-xs font-extrabold",
                  })}
                >
                  Join waitlist
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/download"
                  className={sbButtonClass({
                    variant: "ghost",
                    className: "px-4 py-2 text-xs font-semibold",
                  })}
                >
                  Download
                </Link>
                <a
                  href={`${appOrigin}/login`}
                  className={sbButtonClass({
                    variant: "ghost",
                    className: "px-4 py-2 text-xs font-semibold",
                  })}
                >
                  Sign in
                </a>
                <a
                  href={`${appOrigin}/login?mode=waitlist`}
                  className={sbButtonClass({
                    variant: "primary",
                    className: "px-4 py-2 text-xs font-extrabold",
                  })}
                >
                  Join waitlist
                </a>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
