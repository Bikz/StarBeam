import NextAuth from "next-auth";

import { authOptions } from "@/lib/auth";

// Ensure NextAuth runs in the Node.js runtime (it requires server-only env vars
// and database access). Avoid edge/runtime ambiguity behind proxies.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
