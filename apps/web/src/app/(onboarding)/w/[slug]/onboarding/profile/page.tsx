import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import OnboardingPublicProfileStepForm from "../OnboardingPublicProfileStepForm";
import { savePublicProfile } from "../actions";
import { authOptions } from "@/lib/auth";
import { isOnboardingV2Enabled } from "@/lib/flags";

export default async function OnboardingPublicProfileStep({
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
    select: { linkedinUrl: true, websiteUrl: true },
  });

  const defaultUrl = (profile?.linkedinUrl ?? profile?.websiteUrl ?? "").trim();
  const skipHref = `/w/${membership.workspace.slug}/onboarding/goals`;

  return (
    <OnboardingPublicProfileStepForm
      workspaceSlug={membership.workspace.slug}
      defaultUrl={defaultUrl}
      skipHref={skipHref}
      action={savePublicProfile}
    />
  );
}
