"use server";

import { prisma } from "@starbeam/db";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { hashBetaKey, normalizeBetaKey } from "@/lib/betaKeys";

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

  const raw = normalizeBetaKey(parsed.data.code);
  const codeHash = hashBetaKey(raw);
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const key = await tx.betaKey.findUnique({
        where: { codeHash },
        select: { id: true, maxUses: true, expiresAt: true, disabledAt: true },
      });
      if (!key) throw new Error("not_found");
      if (key.disabledAt) throw new Error("disabled");
      if (key.expiresAt && key.expiresAt <= now) throw new Error("expired");

      const existing = await tx.betaKeyRedemption.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      });
      if (existing) {
        // User already redeemed a key; treat as idempotent.
        await tx.user.update({
          where: { id: session.user.id },
          data: { betaAccessGrantedAt: now },
        });
        return;
      }

      const used = await tx.betaKeyRedemption.count({
        where: { betaKeyId: key.id },
      });
      if (used >= key.maxUses) throw new Error("exhausted");

      await tx.betaKeyRedemption.create({
        data: { betaKeyId: key.id, userId: session.user.id },
      });

      await tx.user.update({
        where: { id: session.user.id },
        data: { betaAccessGrantedAt: now },
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid_key";
    redirect(`/beta?error=${encodeURIComponent(msg)}`);
  }

  redirect("/dashboard");
}

