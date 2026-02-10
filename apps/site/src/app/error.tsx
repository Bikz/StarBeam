"use client";

import Link from "next/link";
import { useEffect } from "react";
import { sbButtonClass } from "@starbeam/shared";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => console.error(error), [error]);

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
            Please try again. If it keeps happening, use the{" "}
            <Link
              href="/contact"
              className="text-[color:var(--sb-fg)] hover:underline"
            >
              contact page
            </Link>
            .
          </p>

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
              href="/"
              className={sbButtonClass({
                variant: "secondary",
                className: "px-5 py-2.5 text-xs font-semibold",
              })}
            >
              Back to home
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
