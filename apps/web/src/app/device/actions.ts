"use server";

import { prisma } from "@starbeam/db";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { sha256Hex } from "@/lib/apiTokens";

export async function approveDevice(code: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/device?code=${code}`)}`,
    );
  }

  const deviceCode = (code ?? "").trim();
  if (!deviceCode) throw new Error("Missing device code");

  const deviceCodeHash = sha256Hex(deviceCode);
  const req = await prisma.deviceAuthRequest.findUnique({
    where: { deviceCodeHash },
    select: { id: true, status: true, expiresAt: true, approvedUserId: true },
  });

  if (!req) throw new Error("Device code not found");
  if (req.expiresAt <= new Date()) throw new Error("Device code expired");

  // If another user already approved this code, don't let it be hijacked.
  if (req.approvedUserId && req.approvedUserId !== session.user.id) {
    throw new Error("Device code already approved by another user");
  }

  if (req.status === "CONSUMED") {
    redirect(`/device?code=${encodeURIComponent(deviceCode)}&done=1`);
  }

  await prisma.deviceAuthRequest.update({
    where: { id: req.id },
    data: {
      status: "APPROVED",
      approvedUserId: session.user.id,
      approvedAt: new Date(),
    },
  });

  redirect(`/device?code=${encodeURIComponent(deviceCode)}&approved=1`);
}
