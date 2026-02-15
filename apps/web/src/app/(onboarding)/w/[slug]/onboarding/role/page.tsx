import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import OnboardingTextStepForm from "../OnboardingTextStepForm";
import { saveRole } from "../actions";
import { authOptions } from "@/lib/auth";
import { isOnboardingV2Enabled } from "@/lib/flags";

export default async function OnboardingRoleStep({
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

  const profile = await prisma.workspaceMemberProfile.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: membership.workspace.id,
        userId: session.user.id,
      },
    },
    select: { jobTitle: true },
  });

  return (
    <OnboardingTextStepForm
      workspaceSlug={membership.workspace.slug}
      title="What's your current role?"
      description="This helps Starbeam tailor recommendations to your day-to-day."
      fieldName="jobTitle"
      label="Role"
      placeholder="Software engineer, B2B SaaS"
      defaultValue={(profile?.jobTitle ?? "").trim()}
      maxLength={120}
      autoComplete="organization-title"
      action={saveRole}
    />
  );
}
