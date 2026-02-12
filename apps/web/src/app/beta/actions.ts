"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { redeemBetaKeyForUser } from "@/lib/betaKeyRedemption";

const RedeemSchema = z.object({
  code: z.string().min(8),
});

export async function redeemBetaKey(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const parsed = RedeemSchema.safeParse({
    code: String(formData.get("code") ?? ""),
  });
  if (!parsed.success) {
    redirect("/beta?error=invalid_key");
  }

  const result = await redeemBetaKeyForUser({
    code: parsed.data.code,
    userId: session.user.id,
  });

  if (!result.ok) {
    redirect(`/beta?error=${encodeURIComponent(result.error)}`);
  }

  redirect(`/w/personal-${session.user.id}`);
}
