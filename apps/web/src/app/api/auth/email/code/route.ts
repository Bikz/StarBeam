import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@starbeam/db";

import { generate6DigitCode, hashEmailLoginCode } from "@/lib/emailLogin";
import { sendEmail } from "@/lib/emailSender";
import { consumeRateLimit } from "@/lib/rateLimit";

const BodySchema = z.object({
  email: z.string().email(),
  ref: z.string().max(64).optional(),
});

function clientIp(headers: Headers): string {
  const xf = headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() ?? "";
  return headers.get("cf-connecting-ip") ?? "";
}

export async function POST(request: Request) {
  let parsed: z.infer<typeof BodySchema> | null = null;
  try {
    parsed = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const email = parsed.email.trim().toLowerCase();
  const ref = (parsed.ref ?? "").trim();
  const ip = clientIp(request.headers) || "unknown";

  // Always return {ok:true} to avoid turning this into an email enumeration endpoint.
  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );

  if (ref) {
    // Store referral attribution across the OTP flow (best-effort).
    response.cookies.set("sb_ref", ref, {
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
      sameSite: "lax",
    });
  }

  try {
    await Promise.all([
      consumeRateLimit({
        key: `email-code:send:email:${email}`,
        windowSec: 5 * 60,
        limit: 3,
      }),
      consumeRateLimit({
        key: `email-code:send:ip:${ip}`,
        windowSec: 5 * 60,
        limit: 20,
      }),
    ]);

    const code = generate6DigitCode();
    const codeHash = hashEmailLoginCode({ email, code, env: process.env });
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.emailLoginCode.create({
      data: { email, codeHash, expiresAt },
    });

    await sendEmail({
      to: email,
      subject: "Your Starbeam sign-in code",
      text:
        `Your Starbeam sign-in code is: ${code}\n\n` +
        `This code expires in 10 minutes.\n\n` +
        `If you did not request this, you can ignore this email.`,
    });
  } catch {
    // Swallow errors to keep response shape stable.
  }

  return response;
}
