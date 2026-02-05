import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export function buildProvidersFromEnv(
  env: Record<string, string | undefined>,
): NextAuthOptions["providers"] {
  const clientId = env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = env.GOOGLE_CLIENT_SECRET ?? "";

  if (!clientId || !clientSecret) return [];

  return [
    GoogleProvider({
      clientId,
      clientSecret,
      // v0: read-only Google service connections are configured separately.
      // Keep OAuth here to "Sign in with Google" for Starbeam itself.
      authorization: { params: { prompt: "select_account" } },
    }),
  ];
}
