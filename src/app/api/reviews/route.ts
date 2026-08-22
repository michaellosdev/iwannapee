import { captchaRequiredResponse, hasCaptchaSession } from "@/lib/security/captcha";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!hasCaptchaSession(request)) return captchaRequiredResponse();
  const supabase = await createClient();
  const { data: authData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!authData.user) return Response.json({ error: "Sign in before posting a rating." }, { status: 401 });

  const limit = await consumeRateLimit(request, {
    bucket: "review-submit",
    limit: 30,
    windowSeconds: 60 * 60,
    identifier: authData.user.id,
    includeAddress: false,
  });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as {
    restroomId?: unknown;
    overallRating?: unknown;
    cleanlinessRating?: unknown;
    note?: unknown;
  } | null;
  const restroomId = typeof body?.restroomId === "string" ? body.restroomId : "";
  const overallRating = Number(body?.overallRating);
  const cleanlinessRating = Number(body?.cleanlinessRating);
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!uuidPattern.test(restroomId)
    || !Number.isInteger(overallRating) || overallRating < 1 || overallRating > 5
    || !Number.isInteger(cleanlinessRating) || cleanlinessRating < 1 || cleanlinessRating > 5
    || note.length > 500) {
    return Response.json({ error: "Check the rating details and try again." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Ratings are not configured." }, { status: 503 });
  const { data: restroom } = await admin.from("restrooms").select("id,status").eq("id", restroomId).single();
  let ratingAllowed = restroom?.status === "published";
  if (restroom && !ratingAllowed) {
    const now = new Date().toISOString();
    const { data: activePromotion } = await admin
      .from("advertising_campaigns")
      .select("id")
      .eq("restroom_id", restroomId)
      .eq("status", "active")
      .lte("starts_at", now)
      .gt("ends_at", now)
      .limit(1)
      .maybeSingle();
    ratingAllowed = Boolean(activePromotion);
  }
  if (!restroom || !ratingAllowed) {
    return Response.json({ error: "This restroom is not available for ratings." }, { status: 404 });
  }

  const { error } = await admin.from("reviews").upsert({
    restroom_id: restroomId,
    user_id: authData.user.id,
    overall_rating: overallRating,
    cleanliness_rating: cleanlinessRating,
    note: note || null,
    status: "published",
    updated_at: new Date().toISOString(),
  }, { onConflict: "restroom_id,user_id" });
  if (error) {
    console.error("Review submission failed", { error: error.message });
    return Response.json({ error: "We couldn’t save your rating. Please try again." }, { status: 500 });
  }
  return Response.json({ submitted: true });
}
