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
      await provisionNewUser(user.id);
    },
  },
};
