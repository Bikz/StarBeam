"use client";

import Link from "next/link";
import { useEffect } from "react";
import { sbButtonClass } from "@starbeam/shared";
import * as Sentry from "@sentry/nextjs";

import { staleSessionSignOutUrl } from "@/lib/authRecovery";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep a console trace for local debugging, but also report in production when enabled.
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="sb-bg">
      <a href="#main" className="sb-skip-link">
        Skip to content
      </a>
      <div className="mx-auto max-w-2xl px-6 py-16">
        <main id="main" className="sb-card p-8">
          <div className="sb-title text-2xl font-extrabold">
            Something went wrong
          </div>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            Please try again.
          </p>
          {error.digest ? (
            <p className="mt-2 text-xs text-[color:var(--sb-muted)]">
              Reference: {error.digest}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={reset}
              className={sbButtonClass({
                variant: "primary",
                className: "px-5 py-2.5 text-xs font-extrabold",
              })}
            >
              Try again
            </button>
            <Link
              href={staleSessionSignOutUrl()}
              className={sbButtonClass({
                variant: "secondary",
                className: "px-5 py-2.5 text-xs font-semibold",
              })}
            >
              Sign out and retry
            </Link>
            <Link
              href="/dashboard"
              className={sbButtonClass({
                variant: "secondary",
                className: "px-5 py-2.5 text-xs font-semibold",
              })}
            >
              Go to dashboard
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
