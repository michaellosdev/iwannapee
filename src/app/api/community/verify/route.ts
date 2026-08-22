import { captchaRequiredResponse, hasCaptchaSession } from "@/lib/security/captcha";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!hasCaptchaSession(request)) return captchaRequiredResponse();
  const supabase = await createClient();
  const { data: authData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!authData.user) return Response.json({ error: "Sign in before verifying a restroom." }, { status: 401 });

  const limit = await consumeRateLimit(request, {
    bucket: "restroom-verification",
    limit: 40,
    windowSeconds: 60 * 60,
    identifier: authData.user.id,
    includeAddress: false,
  });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as { restroomId?: unknown; verdict?: unknown } | null;
  const restroomId = typeof body?.restroomId === "string" ? body.restroomId : "";
  const verdict = body?.verdict === "confirmed" || body?.verdict === "not_found" ? body.verdict : null;
  if (!uuidPattern.test(restroomId) || !verdict) {
    return Response.json({ error: "Choose whether this restroom is still here." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Community verification is unavailable." }, { status: 503 });
  const { data: restroom } = await admin.from("restrooms").select("id,status").eq("id", restroomId).maybeSingle();
  let contributionAllowed = restroom?.status === "published";
  if (restroom && !contributionAllowed) {
    const now = new Date().toISOString();
    const { data: promotions } = await admin
      .from("advertising_campaigns")
      .select("id,is_test,created_by")
      .eq("restroom_id", restroomId)
      .eq("status", "active")
      .lte("starts_at", now)
      .gt("ends_at", now);
    contributionAllowed = Boolean((promotions || []).some((promotion) => !promotion.is_test || promotion.created_by === authData.user.id));
  }
  if (!restroom || !contributionAllowed) {
    return Response.json({ error: "This restroom is not available for verification." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { error } = await admin.from("restroom_verifications").upsert({
    restroom_id: restroomId,
    user_id: authData.user.id,
    verdict,
    updated_at: now,
  }, { onConflict: "restroom_id,user_id" });
  if (error) return Response.json({ error: "We couldn’t save this verification." }, { status: 500 });

  if (verdict === "not_found") {
    const { data: existingReport } = await admin
      .from("reports")
      .select("id")
      .eq("restroom_id", restroomId)
      .eq("user_id", authData.user.id)
      .eq("reason", "closed")
      .eq("status", "open")
      .maybeSingle();
    if (!existingReport) {
      await admin.from("reports").insert({
        restroom_id: restroomId,
        user_id: authData.user.id,
        reason: "closed",
        details: "Community verification: this user reported that the restroom is no longer here.",
      });
    }
  } else {
    await admin
      .from("reports")
      .update({ status: "dismissed" })
      .eq("restroom_id", restroomId)
      .eq("user_id", authData.user.id)
      .eq("reason", "closed")
      .eq("status", "open");
  }

  const { data: refreshed } = await admin
    .from("restrooms")
    .select("community_verified_at,community_verification_count,community_not_found_count")
    .eq("id", restroomId)
    .single();
  return Response.json({
    saved: true,
    verifiedAt: refreshed?.community_verified_at || null,
    confirmationCount: refreshed?.community_verification_count || 0,
    notFoundCount: refreshed?.community_not_found_count || 0,
  });
}
