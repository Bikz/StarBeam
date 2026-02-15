import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import PageHeader from "@/components/page-header";
import ThemeToggle from "@/components/theme-toggle";
import UiModeToggle from "@/components/ui-mode-toggle";
import { authOptions } from "@/lib/auth";
import { isOnboardingV2Enabled } from "@/lib/flags";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const { slug } = await params;

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug } },
    include: { workspace: true },
  });
  if (!membership) notFound();

  const onboardingV2 = isOnboardingV2Enabled();

  return (
    <div className="grid gap-6">
      {onboardingV2 ? (
        <section className="sb-card p-7">
          <PageHeader
            title="Setup"
            description="Use guided setup to complete onboarding and improve first-pulse reliability."
          />
          <div className="mt-6">
            <Link
              href={`/w/${membership.workspace.slug}/onboarding`}
              className={sbButtonClass({
                variant: "primary",
                className: "h-11 px-5 text-sm font-extrabold",
              })}
            >
              Open guided setup
            </Link>
          </div>
        </section>
      ) : null}

      <section className="sb-card p-7">
        <PageHeader
          title="Theme"
          description="Choose system, light, or dark."
        />
        <div className="mt-6">
          <ThemeToggle variant="full" />
        </div>
      </section>

      <section className="sb-card p-7">
        <PageHeader
          title="Advanced mode"
          description="Advanced mode reveals additional pages (Dashboard, Workspaces, Announcements, Runs). Keep it off unless you’re actively tuning."
        />
        <div className="mt-6 grid gap-4">
          <UiModeToggle />
        </div>
      </section>
    </div>
  );
}
