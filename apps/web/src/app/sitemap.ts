import type { MetadataRoute } from "next";

import { webOrigin } from "@/lib/webOrigin";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = webOrigin();
  const lastModified = new Date();

  return [
    {
      url: `${base}/openclaw`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}

