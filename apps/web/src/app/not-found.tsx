import Link from "next/link";
import { sbButtonClass } from "@starbeam/shared";

export default function NotFound() {
  return (
    <div className="sb-bg">
      <a href="#main" className="sb-skip-link">
        Skip to content
      </a>
      <div className="mx-auto max-w-2xl px-6 py-16">
        <main id="main" className="sb-card p-8">
          <div className="sb-title text-2xl font-extrabold">Page not found</div>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            That URL doesn’t exist.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/dashboard"
              className={sbButtonClass({
                variant: "primary",
                className: "px-5 py-2.5 text-xs font-extrabold",
              })}
            >
              Go to dashboard
            </Link>
            <Link
              href="/login"
              className={sbButtonClass({
                variant: "secondary",
                className: "px-5 py-2.5 text-xs font-semibold",
              })}
            >
              Sign in
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
