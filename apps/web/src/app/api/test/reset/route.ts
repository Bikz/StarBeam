import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@starbeam/db";

import { requireTestEndpoints } from "../_shared";

export const runtime = "nodejs";

const BodySchema = z.object({
  confirm: z.literal("DELETE_ALL_DATA"),
});

function isTruthy(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes((value ?? "").trim().toLowerCase());
}

export async function POST(request: Request) {
  const gate = requireTestEndpoints(request);
  if (gate) return gate;

  if (!isTruthy(process.env.STARB_TEST_RESET_ENABLED)) {
    return NextResponse.json({ error: "reset disabled" }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  // Best-effort: truncate user/workspace rooted domain data. This is intended
  // for local dev and CI smoke tests only.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "User", "Workspace", "EmailLoginCode", "BetaKey", "BetaKeyRedemption" CASCADE',
  );

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
