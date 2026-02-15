import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import EmailCodeSignIn from "@/components/email-code-sign-in";
import { authOptions } from "@/lib/auth";
import {
  isSessionRecoveredError,
  loginErrorMessage,
  staleSessionSignOutUrl,
} from "@/lib/authRecovery";
import { ensureBetaEligibilityProcessed } from "@/lib/betaAccess";
import { safeRedirectPath } from "@/lib/safeRedirect";
import { siteOrigin } from "@/lib/siteOrigin";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string;
    ignoreSession?: string;
    ref?: string;
    mode?: string;
    email?: string;
    error?: string;
  }>;
}) {
  const session = await getServerSession(authOptions);
  const sp = await searchParams;
  const ignoreSession = sp.ignoreSession === "1";

  if (session?.user?.id && !ignoreSession) {
    const status = await ensureBetaEligibilityProcessed(session.user.id);
    if (!status) {
      redirect(staleSessionSignOutUrl());
    }
    redirect(status.hasAccess ? `/w/personal-${session.user.id}` : "/beta");
  }

  const authError = sp.error ? String(sp.error) : "";
  const mode =
    (sp.mode ?? "").trim().toLowerCase() === "waitlist" ? "waitlist" : "signin";
  const title = mode === "waitlist" ? "Join waitlist" : "Sign in";
  const subtitle =
    mode === "waitlist"
      ? "We’ll email you a 6-digit code. If you don’t have an invite yet, you’ll unlock via an invite key or 5 referrals."
      : "We’ll email you a 6-digit code.";

  const initialEmail = typeof sp.email === "string" ? sp.email.trim() : "";

  const callbackUrlRaw = (sp.callbackUrl ?? "/beta").trim() || "/beta";
  const callbackUrlSafe = safeRedirectPath(callbackUrlRaw, "/beta");
  const referralCode = typeof sp.ref === "string" ? sp.ref.trim() : "";
  const callbackUrl =
    referralCode && !callbackUrlSafe.startsWith("/beta/claim")
      ? `/beta/claim?ref=${encodeURIComponent(referralCode)}&next=${encodeURIComponent(callbackUrlSafe)}`
      : callbackUrlSafe;

  const baseParams = new URLSearchParams();
  if (typeof sp.callbackUrl === "string" && sp.callbackUrl.trim()) {
    baseParams.set("callbackUrl", callbackUrlSafe);
  }
  if (referralCode) baseParams.set("ref", referralCode);
  if (initialEmail) baseParams.set("email", initialEmail);
  const signInHref = baseParams.size
    ? `/login?${baseParams.toString()}`
    : "/login";
  const waitlistParams = new URLSearchParams(baseParams);
  waitlistParams.set("mode", "waitlist");
  const waitlistHref = `/login?${waitlistParams.toString()}`;

  return (
    <div className="sb-bg">
      <a href="#main" className="sb-skip-link">
        Skip to content
      </a>
      <div className="min-h-[100dvh] lg:grid lg:grid-cols-2">
        <section className="relative flex items-center px-6 py-14 sm:px-10 sm:py-16 lg:px-14">
          <div className="pointer-events-none absolute -top-16 -left-16 h-72 w-72 rounded-full bg-[color:var(--sb-bg-glow-a)] blur-3xl opacity-70" />
          <div className="pointer-events-none absolute top-28 -right-10 h-64 w-64 rounded-full bg-[color:var(--sb-bg-glow-b)] blur-3xl opacity-70" />
          <div className="pointer-events-none absolute -bottom-10 left-10 h-72 w-72 rounded-full bg-[color:var(--sb-bg-glow-c)] blur-3xl opacity-70" />

          <div className="relative w-full max-w-xl">
            <div className="inline-flex items-center gap-2">
              <span className="sb-pill text-[11px] font-extrabold tracking-wide uppercase text-[color:var(--sb-muted)]">
                Starbeam
              </span>
              <span className="sb-pill text-[11px] font-semibold text-[color:var(--sb-muted)]">
                Private beta
              </span>
            </div>

            <h1
              className="mt-5 text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.02] text-[color:var(--sb-fg)]"
              style={{
                fontFamily: "var(--font-sb-display), ui-sans-serif, system-ui",
              }}
            >
              A calm daily pulse, pulled from the tools you already use.
            </h1>
            <p className="mt-4 text-base text-[color:var(--sb-muted)] leading-relaxed max-w-prose">
              {mode === "waitlist"
                ? "Join the waitlist to unlock access. If you already have an invite, you can sign in now."
                : "Sign in with a 6-digit email code. No passwords, no account recovery drama."}
            </p>

            <div className="mt-7 grid gap-3 max-w-prose">
              <div className="sb-card-inset p-4">
                <div className="text-xs font-extrabold sb-title">
                  What you get
                </div>
                <ul className="mt-2 grid gap-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                  <li>
                    <span className="font-semibold text-[color:var(--sb-fg)]">
                      One calm pulse
                    </span>{" "}
                    each morning: what changed, why it matters, and what to do
                    next.
                  </li>
                  <li>
                    <span className="font-semibold text-[color:var(--sb-fg)]">
                      Citations by default
                    </span>{" "}
                    so you can verify quickly and move on.
                  </li>
                  <li>
                    <span className="font-semibold text-[color:var(--sb-fg)]">
                      Context-aware
                    </span>{" "}
                    with goals and pinned announcements to keep your team
                    aligned.
                  </li>
                </ul>
              </div>
            </div>

            <p className="mt-6 text-xs text-[color:var(--sb-muted)] leading-relaxed max-w-prose">
              Tip: if you don’t see the code, check spam or search for{" "}
              <span className="font-semibold text-[color:var(--sb-fg)]">
                Starbeam
              </span>
              .
            </p>
          </div>
        </section>

        <section className="relative flex items-center justify-center px-6 py-14 sm:px-10 sm:py-16 lg:px-14 lg:border-l lg:border-[color:var(--sb-divider)]">
          <div className="w-full max-w-md">
            <main id="main" className="sb-card p-8 sm:p-9">
              <div className="sb-card-inset inline-flex flex-wrap items-center gap-1 p-1">
                <Link
                  href={signInHref}
                  className={[
                    "rounded-full px-4 py-2 text-xs font-extrabold transition",
                    mode === "signin"
                      ? "bg-[color:var(--sb-card)] text-[color:var(--sb-fg)] shadow-[var(--sb-shadow-soft)]"
                      : "text-[color:var(--sb-muted)] hover:text-[color:var(--sb-fg)]",
                  ].join(" ")}
                  aria-current={mode === "signin" ? "page" : undefined}
                >
                  Sign in
                </Link>
                <Link
                  href={waitlistHref}
                  className={[
                    "rounded-full px-4 py-2 text-xs font-extrabold transition",
                    mode === "waitlist"
                      ? "bg-[color:var(--sb-card)] text-[color:var(--sb-fg)] shadow-[var(--sb-shadow-soft)]"
                      : "text-[color:var(--sb-muted)] hover:text-[color:var(--sb-fg)]",
                  ].join(" ")}
                  aria-current={mode === "waitlist" ? "page" : undefined}
                >
                  Join waitlist
                </Link>
              </div>

              <div className="mt-6 flex items-start justify-between gap-6">
                <div>
                  <div className="sb-title text-2xl">{title}</div>
                  <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                    {subtitle}
                  </p>
                </div>
                <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--sb-card-border)] bg-[color:var(--sb-inset-bg)] shadow-[var(--sb-shadow-soft)]">
                  <span className="sb-title text-sm font-extrabold">sb</span>
                </div>
              </div>

              {authError ? (
                <div className="mt-5 sb-alert">
                  <div>{loginErrorMessage(authError)}</div>
                  {isSessionRecoveredError(authError) ? (
                    <div className="mt-2 text-xs text-[color:var(--sb-muted)]">
                      If this keeps happening,{" "}
                      <a
                        href={staleSessionSignOutUrl()}
                        className="underline hover:no-underline"
                      >
                        clear session and retry
                      </a>
                      .
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-6">
                <EmailCodeSignIn
                  callbackUrl={callbackUrl}
                  initialEmail={initialEmail}
                  variant={mode === "waitlist" ? "waitlist" : "signin"}
                />
              </div>

              <div className="mt-8 flex flex-wrap gap-3 text-sm">
                <a
                  href={siteOrigin()}
                  className="text-[color:var(--sb-muted)] hover:underline"
                >
                  Learn more
                </a>
              </div>
            </main>
          </div>
        </section>
      </div>
    </div>
  );
}
