import crypto from "node:crypto";

import { prisma } from "@starbeam/db";
import { NextResponse } from "next/server";

import { sha256Hex } from "@/lib/apiTokens";
import { webOrigin } from "@/lib/webOrigin";

export async function POST() {
  const deviceCode = crypto.randomBytes(16).toString("hex");
  const deviceCodeHash = sha256Hex(deviceCode);
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000);

  await prisma.deviceAuthRequest.create({
    data: { deviceCodeHash, expiresAt, status: "PENDING" },
  });

  const verificationUrl = `${webOrigin()}/device?code=${encodeURIComponent(deviceCode)}`;

  return NextResponse.json(
    { deviceCode, verificationUrl },
    { headers: { "Cache-Control": "no-store" } },
  );
}

