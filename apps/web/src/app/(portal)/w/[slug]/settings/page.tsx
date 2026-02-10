import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import PageHeader from "@/components/page-header";
import ThemeToggle from "@/components/theme-toggle";
import UiModeToggle from "@/components/ui-mode-toggle";
import { authOptions } from "@/lib/auth";

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
    select: { id: true },
  });
  if (!membership) notFound();

  return (
    <div className="grid gap-6">
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
