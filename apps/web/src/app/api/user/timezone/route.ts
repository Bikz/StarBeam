import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import { consumeRateLimit, RateLimitError } from "@/lib/rateLimit";
import { webOrigin } from "@/lib/webOrigin";

const BodySchema = z.object({
  timezone: z.string().min(1).max(64),
});

function isValidIanaTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function isSameOrigin(req: Request): boolean {
  const origin = (req.headers.get("origin") ?? "").trim();
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(webOrigin()).origin;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json(
      { ok: false, error: "Forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    await consumeRateLimit({
      key: `tz_update:user:${session.user.id}`,
      windowSec: 5 * 60,
      limit: Number(process.env.STARB_TZ_UPDATE_LIMIT_5M ?? "20"),
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { ok: false, error: "Too many requests" },
        { status: 429, headers: { "Cache-Control": "no-store" } },
      );
    }
    throw err;
  }

  let json: unknown = null;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const tz = parsed.data.timezone.trim();
  if (!isValidIanaTimeZone(tz)) {
    return NextResponse.json(
      { ok: false, error: "Invalid timezone" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { timezone: tz },
  });

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
