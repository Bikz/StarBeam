import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import { isOnboardingV2Enabled } from "@/lib/flags";
import { siteOrigin } from "@/lib/siteOrigin";

export default async function OnboardingMacosStep({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const { slug } = await params;
  if (!isOnboardingV2Enabled()) redirect(`/w/${slug}/settings`);

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug } },
    include: { workspace: true },
  });
  if (!membership) notFound();
  if (membership.onboardingCompletedAt) {
    redirect(`/w/${membership.workspace.slug}/pulse`);
  }

  const base = `/w/${membership.workspace.slug}`;
  const dl = `${siteOrigin()}/download`;

  return (
    <section className="sb-card p-7">
      <div>
        <h1 className="sb-title text-2xl font-extrabold">
          Starbeam works best in your menu bar
        </h1>
        <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
          The macOS app keeps your pulse one click away and makes it easy to
          stay in your daily loop.
        </p>
      </div>

      <div className="mt-7 sb-card-inset p-5">
        <div className="grid gap-3">
          <div className="sb-title text-base font-extrabold">
            Download Starbeam for macOS
          </div>
          <div className="text-sm text-[color:var(--sb-muted)] leading-relaxed">
            You can install it now or come back later from the Pulse page.
          </div>
          <div className="mt-1">
            <a
              href={dl}
              target="_blank"
              rel="noreferrer"
              className={sbButtonClass({
                variant: "primary",
                className: "h-11 px-5 text-sm font-extrabold",
              })}
            >
              Download macOS app
            </a>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-black/10 dark:border-white/10 bg-[color:var(--sb-bg0)]/95 backdrop-blur">
        <div className="sb-container py-4 grid grid-cols-3 items-center gap-3">
          <div className="justify-self-start">
            <Link
              href={`${base}/onboarding/finish`}
              className={sbButtonClass({
                variant: "secondary",
                className: "h-11 px-5 text-sm font-semibold",
              })}
            >
              Skip for now
            </Link>
          </div>

          <div className="justify-self-center">
            <Link
              href={`${base}/onboarding/finish`}
              className={sbButtonClass({
                variant: "primary",
                className: "h-11 px-8 text-sm font-extrabold",
              })}
            >
              Continue
            </Link>
          </div>

          <div />
        </div>
      </div>
    </section>
  );
}
