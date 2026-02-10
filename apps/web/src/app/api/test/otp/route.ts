import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@starbeam/db";

import { generate6DigitCode, hashEmailLoginCode } from "@/lib/emailLogin";

import { requireTestEndpoints } from "../_shared";

export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  const gate = requireTestEndpoints(request);
  if (gate) return gate;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const code = generate6DigitCode();
  const codeHash = hashEmailLoginCode({ email, code, env: process.env });
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.emailLoginCode.create({
    data: { email, codeHash, expiresAt },
  });

  return NextResponse.json(
    { ok: true, email, code, expiresAt: expiresAt.toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
