"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import * as Sentry from "@sentry/nextjs";

function initSentryOnce(): void {
  const dsn = (process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").trim();
  if (!dsn) return;

  // In Next.js, this is evaluated in the browser bundle. Sentry will be a no-op
  // when DSN is empty.
  Sentry.init({
    dsn,
    environment:
      (process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "").trim() ||
      (process.env.NODE_ENV ?? "development"),
    // Keep this off by default; enable with project-level sampling if desired.
    tracesSampleRate: 0,
  });
}

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initSentryOnce();
  }, []);

  return <SessionProvider>{children}</SessionProvider>;
}
