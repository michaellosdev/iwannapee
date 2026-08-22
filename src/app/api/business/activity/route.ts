import { createHmac } from "node:crypto";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const eventTypes = new Set(["impression", "detail_open", "promo_copy", "qr_copy", "website_click"]);

function analyticsSecret() {
  return process.env.RATE_LIMIT_SECRET?.trim()
    || process.env.CAPTCHA_SESSION_SECRET?.trim()
    || process.env.SUPABASE_SECRET_KEY?.trim();
}

export async function POST(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  if (request.headers.get("origin") !== requestOrigin) {
    return Response.json({ error: "Invalid activity origin." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    campaignId?: unknown;
    eventType?: unknown;
    viewId?: unknown;
  } | null;
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId : "";
  const eventType = typeof body?.eventType === "string" ? body.eventType : "";
  const viewId = typeof body?.viewId === "string" ? body.viewId : "";
  if (!uuidPattern.test(campaignId) || !eventTypes.has(eventType) || viewId.length < 12 || viewId.length > 100) {
    return Response.json({ error: "Invalid promotion activity." }, { status: 400 });
  }

  const limit = await consumeRateLimit(request, {
    bucket: "business-activity",
    limit: 180,
    windowSeconds: 60,
    identifier: viewId,
  });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const secret = analyticsSecret();
  const admin = createAdminClient();
  if (!secret || !admin) return Response.json({ error: "Activity tracking is unavailable." }, { status: 503 });

  const now = new Date().toISOString();
  const { data: campaign } = await admin
    .from("advertising_campaigns")
    .select("id")
    .eq("id", campaignId)
    .eq("status", "active")
    .lte("starts_at", now)
    .gt("ends_at", now)
    .maybeSingle();
  if (!campaign) return Response.json({ recorded: false });

  const viewTokenHash = createHmac("sha256", secret).update(viewId).digest("hex");
  const { error } = await admin.from("promotion_activity_events").insert({
    campaign_id: campaignId,
    event_type: eventType,
    view_token_hash: viewTokenHash,
  });
  if (error && error.code !== "23505") {
    console.error("Promotion activity insert failed", { eventType, error: error.message });
    return Response.json({ error: "Activity tracking failed." }, { status: 500 });
  }

  return Response.json({ recorded: true }, { headers: { "Cache-Control": "no-store" } });
}
