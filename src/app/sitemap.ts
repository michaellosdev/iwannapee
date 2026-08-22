import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const policyPages = ["terms", "refund-policy", "privacy", "contact"];
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "daily",
      priority: 1,
    },
    ...policyPages.map((pathname) => ({
      url: `${SITE_URL}/${pathname}`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
