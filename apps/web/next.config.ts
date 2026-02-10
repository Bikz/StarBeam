import type { NextConfig } from "next";
import path from "node:path";
import dotenv from "dotenv";

// Load repo-root env files when running Next from the app directory (local dev).
// In production, env vars should come from the host.
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// NextAuth.js v4 expects NEXTAUTH_* env vars. We treat AUTH_* as canonical in
// this repo and map to NEXTAUTH_* for library compatibility.
if (process.env.AUTH_URL && !process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = process.env.AUTH_URL;
}
if (process.env.AUTH_SECRET && !process.env.NEXTAUTH_SECRET) {
  process.env.NEXTAUTH_SECRET = process.env.AUTH_SECRET;
}

const nextConfig: NextConfig = {
  transpilePackages: ["@starbeam/db", "@starbeam/shared"],
  // Expose Sentry settings to the browser build when provided. This keeps the
  // public contract small (operators set SENTRY_* only) while still allowing
  // client-side error reporting.
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN ?? "",
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT ?? "",
  },
};

export default nextConfig;
