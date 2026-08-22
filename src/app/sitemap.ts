import type { MetadataRoute } from "next";
import { DIRECTORY_CITIES } from "@/lib/public-directory";
import { businessPath } from "@/lib/public-links";
import { SITE_URL } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const policyPages = ["terms", "refund-policy", "privacy", "contact"];
  const admin = createAdminClient();
  const { data: businesses } = admin
    ? await admin.from("business_profiles").select("id,business_name,updated_at").eq("status", "verified").order("updated_at", { ascending: false }).limit(1000)
    : { data: [] };
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/restrooms`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...DIRECTORY_CITIES.map((city) => ({
      url: `${SITE_URL}/cities/${city.slug}/restrooms`,
      changeFrequency: "daily" as const,
      priority: city.slug === "glendale-ca" ? 0.9 : 0.8,
    })),
    ...(businesses || []).map((business) => ({
      url: `${SITE_URL}${businessPath(business)}`,
      lastModified: business.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...policyPages.map((pathname) => ({
      url: `${SITE_URL}/${pathname}`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
