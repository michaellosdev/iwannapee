import { captchaRequiredResponse, hasCaptchaSession } from "@/lib/security/captcha";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { InvalidStoredPhoto, removeUploadedPhotos, verifyUploadedPhotos } from "@/lib/server/photo-storage";
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
    photoStoragePaths?: unknown;
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
  let uploadedPaths: string[] = [];
  let uploadedPhotos: Awaited<ReturnType<typeof verifyUploadedPhotos>> = [];
  try {
    uploadedPhotos = await verifyUploadedPhotos(admin, authData.user.id, body?.photoStoragePaths, 3);
    uploadedPaths = uploadedPhotos.map((photo) => photo.path);
  } catch (error) {
    if (error instanceof InvalidStoredPhoto) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "We couldn’t validate the review photos." }, { status: 500 });
  }
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
    await removeUploadedPhotos(admin, uploadedPaths);
    return Response.json({ error: "This restroom is not available for ratings." }, { status: 404 });
  }

  const { data: existingReview } = await admin
    .from("reviews")
    .select("id")
    .eq("restroom_id", restroomId)
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (existingReview && uploadedPhotos.length > 0) {
    const { count } = await admin
      .from("community_photos")
      .select("id", { count: "exact", head: true })
      .eq("review_id", existingReview.id)
      .in("status", ["pending", "published"]);
    if ((count || 0) + uploadedPhotos.length > 3) {
      await removeUploadedPhotos(admin, uploadedPaths);
      return Response.json({ error: "A review can include up to three photos." }, { status: 400 });
    }
  }

  const { data: review, error } = await admin.from("reviews").upsert({
    restroom_id: restroomId,
    user_id: authData.user.id,
    overall_rating: overallRating,
    cleanliness_rating: cleanlinessRating,
    note: note || null,
    status: "published",
    updated_at: new Date().toISOString(),
  }, { onConflict: "restroom_id,user_id" }).select("id").single();
  if (error || !review) {
    await removeUploadedPhotos(admin, uploadedPaths);
    console.error("Review submission failed", { error: error?.message || "Review was not returned" });
    return Response.json({ error: "We couldn’t save your rating. Please try again." }, { status: 500 });
  }
  if (uploadedPhotos.length > 0) {
    const { error: photoError } = await admin.from("community_photos").insert(uploadedPhotos.map((photo) => ({
      restroom_id: restroomId,
      review_id: review.id,
      user_id: authData.user.id,
      storage_path: photo.path,
      public_url: photo.publicUrl,
      status: "pending",
    })));
    if (photoError) {
      await removeUploadedPhotos(admin, uploadedPaths);
      console.error("Review photo attachment failed", { error: photoError.message });
      return Response.json({ error: "Your rating was saved, but the photos could not be attached." }, { status: 500 });
    }
  }
  return Response.json({ submitted: true, photoCount: uploadedPhotos.length });
}
