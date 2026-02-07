import crypto from "node:crypto";

import { prisma } from "@starbeam/db";
import { NextResponse } from "next/server";

import { sha256Hex } from "@/lib/apiTokens";
import { consumeRateLimit } from "@/lib/rateLimit";
import { webOrigin } from "@/lib/webOrigin";

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  const xrip = req.headers.get("x-real-ip");
  if (xrip) return xrip.trim();
  return "unknown";
}

export async function POST(request: Request) {
  const ipHash = sha256Hex(clientIp(request));
  await consumeRateLimit({
    key: `device_start:${ipHash}`,
    windowSec: 5 * 60,
    limit: Number(process.env.STARB_DEVICE_START_LIMIT_5M ?? "20") || 20,
  });

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
