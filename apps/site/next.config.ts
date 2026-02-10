import type { NextConfig } from "next";
import path from "node:path";
import dotenv from "dotenv";

// Load repo-root env files when running Next from the app directory (local dev).
// In production, env vars should come from the host.
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@starbeam/db", "@starbeam/shared"],
};

export default nextConfig;
