import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@starbeam/db", "@starbeam/shared"],
};

export default nextConfig;
