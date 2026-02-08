import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import EmailCodeSignIn from "@/components/email-code-sign-in";
import SignInButton from "@/components/sign-in-button";
import { authOptions } from "@/lib/auth";
import { ensureBetaEligibilityProcessed } from "@/lib/betaAccess";
import { siteOrigin } from "@/lib/siteOrigin";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; ref?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    const status = await ensureBetaEligibilityProcessed(session.user.id);
    redirect(status.hasAccess ? "/dashboard" : "/beta");
  }

  const hasGoogleAuth =
    typeof process.env.GOOGLE_CLIENT_ID === "string" &&
    process.env.GOOGLE_CLIENT_ID.length > 0 &&
    typeof process.env.GOOGLE_CLIENT_SECRET === "string" &&
    process.env.GOOGLE_CLIENT_SECRET.length > 0;

  const sp = await searchParams;
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
          <div className="sb-title text-2xl">Sign in</div>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            Starbeam is a daily pulse for founders and startup teams.
          </p>

          <div className="mt-6">
            <EmailCodeSignIn
              callbackUrl={callbackUrl}
              initialReferralCode={referralCode}
            />
          </div>

          {hasGoogleAuth ? (
            <div className="mt-6">
              <div className="text-[11px] font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                Or
              </div>
              <div className="mt-3">
                <SignInButton
                  provider="google"
                  label="Sign in with Google"
                  callbackUrl={callbackUrl}
                />
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3 text-sm">
            <a
              href={`${siteOrigin()}/waitlist`}
              className="text-[color:var(--sb-fg)] hover:underline"
            >
              Join waitlist
            </a>
            <span className="text-[color:var(--sb-muted)]" aria-hidden>
              ·
            </span>
            <Link href="/" className="text-[color:var(--sb-muted)] hover:underline">
              Back to app
            </Link>
            <span className="text-[color:var(--sb-muted)]" aria-hidden>
              ·
            </span>
            <a
              href={siteOrigin()}
              className="text-[color:var(--sb-muted)] hover:underline"
            >
              Visit site
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
