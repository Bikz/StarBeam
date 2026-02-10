import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import EmailCodeSignIn from "@/components/email-code-sign-in";
import { authOptions } from "@/lib/auth";
import { ensureBetaEligibilityProcessed } from "@/lib/betaAccess";
import { siteOrigin } from "@/lib/siteOrigin";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; ref?: string; mode?: string; email?: string; error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    const status = await ensureBetaEligibilityProcessed(session.user.id);
    redirect(status.hasAccess ? `/w/personal-${session.user.id}` : "/beta");
  }

  const sp = await searchParams;
  const authError = sp.error ? String(sp.error) : "";
  const mode = (sp.mode ?? "").trim().toLowerCase() === "waitlist" ? "waitlist" : "signin";
  const title = mode === "waitlist" ? "Join waitlist" : "Sign in";
  const subtitle =
    mode === "waitlist"
      ? "We’ll email you a 6-digit code. If you don’t have an invite yet, you’ll unlock via an invite key or 5 referrals."
      : "We’ll email you a 6-digit code.";

  const initialEmail = typeof sp.email === "string" ? sp.email.trim() : "";

  const callbackUrlRaw = (sp.callbackUrl ?? "/beta").trim() || "/beta";
  const safeNext = callbackUrlRaw.startsWith("/") ? callbackUrlRaw : "/beta";
  const referralCode = typeof sp.ref === "string" ? sp.ref.trim() : "";
  const callbackUrl = referralCode && !callbackUrlRaw.startsWith("/beta/claim")
    ? `/beta/claim?ref=${encodeURIComponent(referralCode)}&next=${encodeURIComponent(safeNext)}`
    : callbackUrlRaw;

  return (
    <div className="sb-bg">
      <a href="#main" className="sb-skip-link">
        Skip to content
      </a>
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <section className="relative">
            <div className="pointer-events-none absolute -top-16 -left-16 h-72 w-72 rounded-full bg-[color:var(--sb-bg-glow-a)] blur-3xl opacity-70" />
            <div className="pointer-events-none absolute top-28 -right-10 h-64 w-64 rounded-full bg-[color:var(--sb-bg-glow-b)] blur-3xl opacity-70" />
            <div className="pointer-events-none absolute -bottom-10 left-10 h-72 w-72 rounded-full bg-[color:var(--sb-bg-glow-c)] blur-3xl opacity-70" />

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
              style={{ fontFamily: "var(--font-sb-display), ui-sans-serif, system-ui" }}
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
                <div className="text-xs font-extrabold sb-title">What you get</div>
                <ul className="mt-2 grid gap-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                  <li>
                    <span className="font-semibold text-[color:var(--sb-fg)]">Pulse</span>{" "}
                    cards for what matters today (focus, calendar, updates).
                  </li>
                  <li>
                    <span className="font-semibold text-[color:var(--sb-fg)]">One minute</span>{" "}
                    each morning. No inbox mining.
                  </li>
                  <li>
                    <span className="font-semibold text-[color:var(--sb-fg)]">macOS app</span>{" "}
                    signs in via device approval, then stays synced.
                  </li>
                </ul>
              </div>

              <div className="sb-card-inset p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-extrabold sb-title">Today’s pulse (preview)</div>
                  <div className="sb-kbd">7:30 AM</div>
                </div>
                <div className="mt-3 grid gap-2">
                  <div className="h-10 rounded-xl border border-[color:var(--sb-divider)] bg-[color:var(--sb-inset-bg)] p-3">
                    <div className="sb-skeleton h-3 w-[62%] rounded-lg" />
                  </div>
                  <div className="h-10 rounded-xl border border-[color:var(--sb-divider)] bg-[color:var(--sb-inset-bg)] p-3">
                    <div className="sb-skeleton h-3 w-[78%] rounded-lg" />
                  </div>
                  <div className="h-10 rounded-xl border border-[color:var(--sb-divider)] bg-[color:var(--sb-inset-bg)] p-3">
                    <div className="sb-skeleton h-3 w-[55%] rounded-lg" />
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-6 text-xs text-[color:var(--sb-muted)] leading-relaxed max-w-prose">
              Tip: if you don’t see the code, check spam or search for{" "}
              <span className="font-semibold text-[color:var(--sb-fg)]">Starbeam</span>.
            </p>
          </section>

          <main id="main" className="sb-card p-8 sm:p-9">
            <div className="flex items-start justify-between gap-6">
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
                {authError === "CredentialsSignin"
                  ? "That code didn’t work. Please try again."
                  : "Could not sign in. Please try again."}
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
              {mode === "waitlist" ? (
                <Link href="/login" className="text-[color:var(--sb-fg)] hover:underline">
                  Already have an invite? Sign in
                </Link>
              ) : (
                <Link
                  href="/login?mode=waitlist"
                  className="text-[color:var(--sb-fg)] hover:underline"
                >
                  New here? Join waitlist
                </Link>
              )}
              <a href={siteOrigin()} className="text-[color:var(--sb-muted)] hover:underline">
                Learn more
              </a>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
