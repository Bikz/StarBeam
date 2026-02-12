import { Prisma, prisma } from "@starbeam/db";

import { hashBetaKey, normalizeBetaKey } from "@/lib/betaKeys";

type RedeemBetaKeyError =
  | "invalid_key"
  | "not_found"
  | "disabled"
  | "expired"
  | "exhausted";

export async function redeemBetaKeyForUser(args: {
  code: string;
  userId: string;
  now?: Date;
}): Promise<{ ok: true } | { ok: false; error: RedeemBetaKeyError }> {
  const raw = normalizeBetaKey(args.code);
  if (!raw) return { ok: false, error: "invalid_key" };

  const codeHash = hashBetaKey(raw);
  const now = args.now ?? new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          maxUses: number;
          expiresAt: Date | null;
          disabledAt: Date | null;
        }>
      >(Prisma.sql`
        SELECT "id", "maxUses", "expiresAt", "disabledAt"
        FROM "BetaKey"
        WHERE "codeHash" = ${codeHash}
        FOR UPDATE
      `);

      const key = rows[0];
      if (!key) return { ok: false as const, error: "not_found" as const };
      if (key.disabledAt)
        return { ok: false as const, error: "disabled" as const };
      if (key.expiresAt && key.expiresAt.getTime() <= now.getTime()) {
        return { ok: false as const, error: "expired" as const };
      }

      const existing = await tx.betaKeyRedemption.findUnique({
        where: { userId: args.userId },
        select: { id: true },
      });
      if (existing) {
        await tx.user.updateMany({
          where: { id: args.userId, betaAccessGrantedAt: null },
          data: { betaAccessGrantedAt: now },
        });
        return { ok: true as const };
      }

      const used = await tx.betaKeyRedemption.count({
        where: { betaKeyId: key.id },
      });
      if (used >= key.maxUses) {
        return { ok: false as const, error: "exhausted" as const };
      }

      await tx.betaKeyRedemption
        .create({
          data: { betaKeyId: key.id, userId: args.userId },
        })
        .catch((err: unknown) => {
          // If the user redeems a different key concurrently, the global
          // @@unique([userId]) constraint can race. Treat as idempotent success.
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2002"
          ) {
            return null;
          }
          throw err;
        });

      await tx.user.updateMany({
        where: { id: args.userId, betaAccessGrantedAt: null },
        data: { betaAccessGrantedAt: now },
      });

      return { ok: true as const };
    });

    return result;
  } catch {
    // Fail closed and keep errors non-leaky.
    return { ok: false, error: "invalid_key" };
  }
}
