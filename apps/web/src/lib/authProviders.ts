import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

import { prisma } from "@starbeam/db";

import { consumeRateLimit } from "@/lib/rateLimit";
import { provisionNewUser } from "@/lib/userProvisioning";

import { hashEmailLoginCode } from "./emailLogin";

export function buildProvidersFromEnv(
  env: Record<string, string | undefined>,
): NextAuthOptions["providers"] {
  const clientId = env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = env.GOOGLE_CLIENT_SECRET ?? "";

  const providers: NonNullable<NextAuthOptions["providers"]> = [];

  // Default auth path: email + short code (OTP).
  providers.push(
    CredentialsProvider({
      name: "Email code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", type: "text" },
      },
      authorize: async (credentials, req) => {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const code = String(credentials?.code ?? "").trim();

        if (!email) return null;
        if (!code || !/^[0-9]{6}$/.test(code)) return null;

        const ip =
          (req?.headers?.["x-forwarded-for"] as string | undefined)
            ?.split(",")[0]
            ?.trim() ??
          (req?.headers?.["cf-connecting-ip"] as string | undefined) ??
          "";

        try {
          await Promise.all([
            consumeRateLimit({
              key: `email-code:verify:email:${email}`,
              windowSec: 5 * 60,
              limit: 30,
            }),
            consumeRateLimit({
              key: `email-code:verify:ip:${ip || "unknown"}`,
              windowSec: 5 * 60,
              limit: 120,
            }),
          ]);
        } catch {
          return null;
        }

        const now = new Date();
        const codeHash = hashEmailLoginCode({ email, code, env });

        const found = await prisma.emailLoginCode.findFirst({
          where: {
            email,
            codeHash,
            consumedAt: null,
            expiresAt: { gt: now },
          },
          select: { id: true },
        });

        if (!found) return null;

        const user = await prisma.$transaction(async (tx) => {
          await tx.emailLoginCode.update({
            where: { id: found.id },
            data: { consumedAt: now },
          });

          const existing = await tx.user.findUnique({
            where: { email },
            select: {
              id: true,
              email: true,
              name: true,
              image: true,
              emailVerified: true,
            },
          });

          if (existing?.id) {
            if (!existing.emailVerified) {
              await tx.user.update({
                where: { id: existing.id },
                data: { emailVerified: now },
              });
            }
            return existing;
          }

          const created = await tx.user.create({
            data: { email, emailVerified: now },
            select: { id: true, email: true, name: true, image: true },
          });

          return created;
        });

        // Provision outside the code consumption transaction to keep locks small.
        await provisionNewUser(user.id);

        return {
          id: user.id,
          email: user.email ?? email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
        };
      },
    }),
  );

  // Optional: "Sign in with Google" for accounts within the OAuth app audience.
  if (clientId && clientSecret) {
    providers.push(
      GoogleProvider({
        clientId,
        clientSecret,
        // v0: read-only Google service connections are configured separately.
        // Keep OAuth here to "Sign in with Google" for Starbeam itself.
        authorization: { params: { prompt: "select_account" } },
      }),
    );
  }

  return providers;
}
