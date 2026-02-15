import type { MetadataRoute } from "next";

import { webOrigin } from "@/lib/webOrigin";

export default function robots(): MetadataRoute.Robots {
  const base = webOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/openclaw", "/openclaw/"],
        disallow: [
          "/admin",
          "/api/",
          "/app",
          "/beta",
          "/dashboard",
          "/device",
          "/feedback",
          "/invite",
          "/login",
          "/openclaw/setup",
          "/r/",
          "/signout",
          "/w/",
          "/workspaces",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
