import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@starbeam/db";
import type { NextAuthOptions } from "next-auth";

import { buildProvidersFromEnv } from "./authProviders";
import { provisionNewUser } from "./userProvisioning";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: buildProvidersFromEnv(process.env),
  pages: {
    // Login is hosted on the app subdomain; marketing lives on the root domain.
    signIn: "/login",
    // Replace the default NextAuth sign-out confirmation UI with Starbeam UI.
    signOut: "/signout",
  },
  session: {
    strategy: "database",
  },
  callbacks: {
    session: async ({ session, user, token }) => {
      // Expose user ID for server-side authorization checks.
      // Note: when NextAuth uses JWT sessions, `user` is undefined and the ID
      // lives in `token.sub`.
      if (session.user) {
        const id = user?.id ?? (typeof token?.sub === "string" ? token.sub : "");
        if (id) session.user.id = id;
      }
      return session;
    },
  },
  events: {
    createUser: async ({ user }) => {
      await provisionNewUser(user.id);
    },
  },
};
