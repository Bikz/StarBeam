import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import OnboardingCompanyStepForm from "../OnboardingCompanyStepForm";
import { saveCompany } from "../actions";
import { authOptions } from "@/lib/auth";
import { isOnboardingV2Enabled } from "@/lib/flags";

export default async function OnboardingCompanyStep({
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
    select: { company: true, companyUrl: true },
  });

  return (
    <OnboardingCompanyStepForm
      workspaceSlug={membership.workspace.slug}
      defaultCompany={(profile?.company ?? "").trim()}
      defaultCompanyUrl={(profile?.companyUrl ?? "").trim()}
      action={saveCompany}
    />
  );
}
