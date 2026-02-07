import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@starbeam/db";

import { siteOrigin } from "@/lib/siteOrigin";
import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";
import { supportEmail } from "@/lib/supportEmail";
import { webOrigin } from "@/lib/webOrigin";

export default async function WaitlistThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const sp = await searchParams;
  const code = (sp.code ?? "").trim();
  if (!code) notFound();

  const signup = await prisma.waitlistSignup.findUnique({
    where: { referralCode: code },
    select: { id: true, email: true, referralCode: true, createdAt: true },
  });
  if (!signup) notFound();

  const referrals = await prisma.waitlistSignup.count({
    where: { referredById: signup.id },
  });

  const shareUrl = `${siteOrigin()}/waitlist?ref=${encodeURIComponent(signup.referralCode)}`;
  const app = webOrigin();
  const email = supportEmail();

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <SiteHeader appOrigin={app} />
        <div className="sb-card p-8">
          <div className="sb-title text-2xl">You’re on the list</div>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            We’ll email{" "}
            <span className="font-semibold text-[color:var(--sb-fg)]">
              {signup.email}
            </span>{" "}
            when your access is ready.
          </p>

          <div className="mt-6 grid gap-3">
            <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-5">
              <div className="text-xs font-semibold text-[color:var(--sb-muted)]">
                Your referral link
              </div>
              <div className="mt-2 break-all text-xs text-[color:var(--sb-fg)]">
                {shareUrl}
              </div>
              <div className="mt-3 text-xs text-[color:var(--sb-muted)]">
                Referrals:{" "}
                <span className="font-semibold text-[color:var(--sb-fg)]">
                  {referrals}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href={`${app}/login`}
                className="sb-btn sb-btn-primary px-5 py-2.5 text-xs font-extrabold text-[color:var(--sb-fg)]"
              >
                Go to app
              </a>
              <Link
                href="/"
                className="sb-btn px-5 py-2.5 text-xs font-semibold text-[color:var(--sb-fg)]"
              >
                Back to home
              </Link>
            </div>
          </div>
        </div>
        <SiteFooter appOrigin={app} supportEmail={email} />
      </div>
    </div>
  );
}
