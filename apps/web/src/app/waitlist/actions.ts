"use server";

import crypto from "node:crypto";

import { prisma } from "@starbeam/db";
import { redirect } from "next/navigation";
import { z } from "zod";

const JoinWaitlistSchema = z.object({
  email: z.string().email().max(254),
  ref: z.string().max(64).optional(),
});

function makeReferralCode(): string {
  // Short, URL-safe code. Collision risk is negligible; we still guard with retries.
  return crypto.randomBytes(6).toString("base64url");
}

export async function joinWaitlist(formData: FormData) {
  const rawEmail = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const rawRef = String(formData.get("ref") ?? "").trim();

  const parsed = JoinWaitlistSchema.safeParse({
    email: rawEmail,
    ref: rawRef || undefined,
  });
  if (!parsed.success) {
    throw new Error("Invalid email");
  }

  const existing = await prisma.waitlistSignup.findUnique({
    where: { email: parsed.data.email },
    select: { referralCode: true },
  });
  if (existing) {
    redirect(`/waitlist/thanks?code=${encodeURIComponent(existing.referralCode)}`);
  }

  const referredBy =
    parsed.data.ref && parsed.data.ref.trim()
      ? await prisma.waitlistSignup.findUnique({
          where: { referralCode: parsed.data.ref.trim() },
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

  throw new Error("Failed to create waitlist entry");
}

