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
      <div className="mx-auto max-w-xl px-6 py-16">
        <div className="sb-card p-8">
          <div className="sb-title text-2xl">{title}</div>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">{subtitle}</p>

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
        </div>
      </div>
    </div>
  );
}
