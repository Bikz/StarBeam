import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { staleSessionSignOutUrl } from "@/lib/authRecovery";
import { ensureBetaEligibilityProcessed } from "@/lib/betaAccess";

export default async function AppHome() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    const status = await ensureBetaEligibilityProcessed(session.user.id);
    if (!status) {
      redirect(staleSessionSignOutUrl());
    }
    redirect(status.hasAccess ? `/w/personal-${session.user.id}` : "/beta");
  }
  redirect("/login");
}
