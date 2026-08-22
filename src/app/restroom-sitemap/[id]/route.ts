import { restroomPath } from "@/lib/public-links";
import { SITE_URL } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 1000;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const page = Number((await params).id);
  if (!Number.isSafeInteger(page) || page < 0 || page > 10000) return new Response("Not found", { status: 404 });
  const admin = createAdminClient();
  if (!admin) return new Response("Sitemap unavailable", { status: 503 });
  const start = page * PAGE_SIZE;
  const { data, error } = await admin.from("restrooms").select("id,name,updated_at").eq("status", "published").order("id").range(start, start + PAGE_SIZE - 1);
  if (error) return new Response("Sitemap unavailable", { status: 503 });
  if (!data?.length && page > 0) return new Response("Not found", { status: 404 });
  const entries = (data || []).map((restroom) => `<url><loc>${SITE_URL}${restroomPath(restroom)}</loc><lastmod>${new Date(restroom.updated_at).toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`).join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
