import Link from "next/link";

import { joinWaitlist } from "@/app/waitlist/actions";
import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";
import { supportEmail } from "@/lib/supportEmail";
import { webOrigin } from "@/lib/webOrigin";

export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const ref = (sp.ref ?? "").trim();
  const error = (sp.error ?? "").trim();
  const app = webOrigin();
  const email = supportEmail();

  return (
    <div className="sb-bg">
      <a href="#main" className="sb-skip-link">
        Skip to content
      </a>
      <div className="mx-auto max-w-2xl px-6 py-16">
        <SiteHeader appOrigin={app} />
        <main id="main" className="sb-card p-8">
          <div className="sb-title text-2xl">Join the waitlist</div>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            Starbeam is launching soon. Get early access and help shape the product.
          </p>

          <form action={joinWaitlist} className="mt-6 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-[color:var(--sb-muted)]">Email</span>
              <input
                name="email"
                type="email"
                placeholder="you@company.com…"
                autoComplete="email"
                spellCheck={false}
                className="h-11 rounded-2xl border border-black/10 dark:border-white/15 bg-white/45 dark:bg-white/10 px-4 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]"
                required
              />
            </label>

            <input type="hidden" name="ref" value={ref} />
            <input type="hidden" name="returnTo" value="/waitlist" />

            <button type="submit" className="sb-btn sb-btn-primary h-11 px-5 text-sm font-extrabold">
              Join waitlist
            </button>
          </form>

          {error ? (
            <div role="alert" className="mt-4 sb-alert">
              <strong>Couldn’t join the waitlist.</strong>{" "}
              {error === "invalid_email"
                ? "Please enter a valid email address."
                : "Please try again."}
            </div>
          ) : null}

          {ref ? (
            <div className="mt-5 rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-4 text-xs text-[color:var(--sb-muted)]">
              Referral code applied:{" "}
              <span className="font-mono font-semibold text-[color:var(--sb-fg)]">
                {ref}
              </span>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3 text-sm">
            <Link href="/" className="text-[color:var(--sb-muted)] hover:underline">
              ← Back to home
            </Link>
            <span className="text-[color:var(--sb-muted)]" aria-hidden>
              ·
            </span>
            <a
              href={`${app}/login`}
              className="text-[color:var(--sb-fg)] hover:underline"
            >
              Sign in
            </a>
          </div>
        </main>
        <SiteFooter appOrigin={app} supportEmail={email} />
      </div>
    </div>
  );
}
