import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/beta";
  const safeNext = next.startsWith("/") ? next : "/beta";

  const cookieStore = await cookies();
  const referralCode = cookieStore.get("sb_ref")?.value ?? "";

  const resp = NextResponse.redirect(new URL(safeNext, request.url));
  // Clear cookie regardless of validity (prevents loops).
  resp.cookies.set("sb_ref", "", { path: "/", maxAge: 0 });

  if (!referralCode) return resp;

  const [me, referrer] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, referredByUserId: true, referralCode: true },
    }),
    prisma.user.findFirst({
      where: { referralCode },
      select: { id: true },
    }),
  ]);

  if (!me) return resp;
  if (me.referredByUserId) return resp;
  if (!referrer) return resp;
  if (referrer.id === me.id) return resp;

  await prisma.user.update({
    where: { id: me.id },
    data: { referredByUserId: referrer.id },
  });

  return resp;
}
