import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@starbeam/db";
import type { NextAuthOptions } from "next-auth";

import { buildProvidersFromEnv } from "./authProviders";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: buildProvidersFromEnv(process.env),
  pages: {
    // Login is hosted on the app subdomain; marketing lives on the root domain.
    signIn: "/login",
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
