import Link from "next/link";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import SignInButton from "@/components/sign-in-button";
import { authOptions } from "@/lib/auth";
import { isAppHost } from "@/lib/hosts";
import { siteOrigin } from "@/lib/siteOrigin";
import { webOrigin } from "@/lib/webOrigin";

export default async function LoginPage() {
  const host = (await headers()).get("host");

  // Keep auth flows on the app subdomain.
  if (!isAppHost(host)) {
    redirect(`${webOrigin()}/login`);
  }

  const session = await getServerSession(authOptions);
  if (session?.user?.id) redirect("/dashboard");

  const hasGoogleAuth =
    typeof process.env.GOOGLE_CLIENT_ID === "string" &&
    process.env.GOOGLE_CLIENT_ID.length > 0 &&
    typeof process.env.GOOGLE_CLIENT_SECRET === "string" &&
    process.env.GOOGLE_CLIENT_SECRET.length > 0;

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-xl px-6 py-16">
        <div className="sb-card p-8">
          <div className="sb-title text-2xl">Sign in</div>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            Starbeam is a daily pulse for founders and startup teams.
          </p>

          <div className="mt-6">
            {hasGoogleAuth ? (
              <SignInButton />
            ) : (
              <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 px-5 py-3 text-sm text-[color:var(--sb-muted)]">
                Configure Google OAuth (<code>GOOGLE_CLIENT_ID</code>,{" "}
                <code>GOOGLE_CLIENT_SECRET</code>) to enable sign-in.
              </div>
            )}
          </div>

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
