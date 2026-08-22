import { SITE_URL } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const admin = createAdminClient();
  const { count } = admin ? await admin.from("restrooms").select("id", { count: "exact", head: true }).eq("status", "published") : { count: 0 };
  const sitemapCount = Math.max(1, Math.ceil((count || 0) / 1000));
  const entries = Array.from({ length: sitemapCount }, (_, id) => `<sitemap><loc>${SITE_URL}/restroom-sitemap/${id}</loc></sitemap>`).join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
