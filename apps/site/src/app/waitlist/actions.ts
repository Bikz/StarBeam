"use server";

import crypto from "node:crypto";

import { prisma } from "@starbeam/db";
import { redirect } from "next/navigation";
import { z } from "zod";

const JoinWaitlistSchema = z.object({
  email: z.string().email().max(254),
  ref: z.string().max(64).optional(),
  returnTo: z.string().max(256).optional(),
});

function makeReferralCode(): string {
  // Short, URL-safe code. Collision risk is negligible; we still guard with retries.
  return crypto.randomBytes(6).toString("base64url");
}

function safeReturnTo(value: string | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "/waitlist";
  if (!v.startsWith("/")) return "/waitlist";
  if (v.startsWith("//")) return "/waitlist";
  if (v.includes("://")) return "/waitlist";
  if (v.includes("..")) return "/waitlist";
  return v;
}

function withError(returnTo: string, error: string): string {
  const sep = returnTo.includes("?") ? "&" : "?";
  return `${returnTo}${sep}error=${encodeURIComponent(error)}`;
}

export async function joinWaitlist(formData: FormData) {
  const rawEmail = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const rawRef = String(formData.get("ref") ?? "").trim();
  const rawReturnTo = String(formData.get("returnTo") ?? "").trim();

  const parsed = JoinWaitlistSchema.safeParse({
    email: rawEmail,
    ref: rawRef || undefined,
    returnTo: rawReturnTo || undefined,
  });
  if (!parsed.success) {
    redirect(withError(safeReturnTo(rawReturnTo), "invalid_email"));
  }
  const returnTo = safeReturnTo(parsed.data.returnTo);

  const existing = await prisma.waitlistSignup.findUnique({
    where: { email: parsed.data.email },
    select: { referralCode: true },
  });
  if (existing) {
    redirect(`/waitlist/thanks?code=${encodeURIComponent(existing.referralCode)}`);
  }

  const referralCode = parsed.data.ref?.trim() ?? "";
  const referredBy = referralCode
    ? await prisma.waitlistSignup.findUnique({
        where: { referralCode },
        select: { id: true },
      })
    : null;

  for (let i = 0; i < 5; i++) {
    const code = makeReferralCode();
    try {
      await prisma.waitlistSignup.create({
        data: {
          email: parsed.data.email,
          referralCode: code,
          referredById: referredBy?.id ?? null,
        },
      });

      redirect(`/waitlist/thanks?code=${encodeURIComponent(code)}`);
    } catch (err) {
      // Unique constraint collisions are unlikely but possible.
      const codeMaybe = (err as { code?: unknown } | null)?.code;
      if (codeMaybe === "P2002") continue;
      throw err;
    }
  }

  redirect(withError(returnTo, "try_again"));
}
