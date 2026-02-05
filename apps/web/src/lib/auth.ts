import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@starbeam/db";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const hasGoogleAuth =
  typeof process.env.GOOGLE_CLIENT_ID === "string" &&
  process.env.GOOGLE_CLIENT_ID.length > 0 &&
  typeof process.env.GOOGLE_CLIENT_SECRET === "string" &&
  process.env.GOOGLE_CLIENT_SECRET.length > 0;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: hasGoogleAuth
    ? [
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          // v0: read-only Google service connections are configured separately.
          // Keep OAuth here to "Sign in with Google" for Starbeam itself.
          authorization: { params: { prompt: "select_account" } },
        }),
      ]
    : [],
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "database",
  },
  callbacks: {
    session: async ({ session, user }) => {
      // Expose user ID for server-side authorization checks.
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    createUser: async ({ user }) => {
      // Default: every account starts with a personal workspace.
      // Slug is stable so the macOS app can depend on it later.
      const slug = `personal-${user.id}`;
      await prisma.workspace.create({
        data: {
          slug,
          name: "Personal",
          type: "PERSONAL",
          createdById: user.id,
          memberships: { create: { userId: user.id, role: "ADMIN" } },
        },
      });
    },
  },
};
