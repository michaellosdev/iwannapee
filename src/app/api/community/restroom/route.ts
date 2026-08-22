import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const restroomId = new URL(request.url).searchParams.get("restroomId") || "";
  if (!uuidPattern.test(restroomId)) return Response.json({ error: "Invalid restroom." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Community details are unavailable." }, { status: 503 });
  const { data: restroom } = await admin
    .from("restrooms")
    .select("id,status,data_source,source_url,community_verified_at,community_verification_count,community_not_found_count")
    .eq("id", restroomId)
    .maybeSingle();
  if (!restroom) return Response.json({ error: "Restroom not found." }, { status: 404 });

  if (restroom.status !== "published") {
    const supabase = await createClient();
    const { data: authData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    const now = new Date().toISOString();
    let promotionQuery = admin
      .from("advertising_campaigns")
      .select("id,is_test,created_by")
      .eq("restroom_id", restroomId)
      .eq("status", "active")
      .lte("starts_at", now)
      .gt("ends_at", now);
    if (!authData.user) promotionQuery = promotionQuery.eq("is_test", false);
    const { data: promotions } = await promotionQuery.limit(5);
    const allowed = (promotions || []).some((promotion) => !promotion.is_test || promotion.created_by === authData.user?.id);
    if (!allowed) return Response.json({ error: "Restroom not found." }, { status: 404 });
  }

  const [reviewsResult, photosResult] = await Promise.all([
    admin
      .from("reviews")
      .select("id,user_id,overall_rating,cleanliness_rating,note,created_at,updated_at")
      .eq("restroom_id", restroomId)
      .eq("status", "published")
      .order("updated_at", { ascending: false })
      .limit(40),
    admin
      .from("community_photos")
      .select("id,review_id,user_id,public_url,caption,created_at")
      .eq("restroom_id", restroomId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(80),
  ]);
  if (reviewsResult.error || photosResult.error) {
    return Response.json({ error: "Community details are temporarily unavailable." }, { status: 502 });
  }

  const reviews = reviewsResult.data || [];
  const photos = photosResult.data || [];
  const userIds = Array.from(new Set([...reviews.map((review) => review.user_id), ...photos.map((photo) => photo.user_id)]));
  const { data: profiles } = userIds.length > 0
    ? await admin.from("profiles").select("id,display_name").in("id", userIds)
    : { data: [] };
  const displayNameById = new Map((profiles || []).map((profile) => [profile.id, profile.display_name || "IWANNAPEE user"]));

  return Response.json({
    verification: {
      dataSource: restroom.data_source,
      sourceUrl: restroom.source_url,
      verifiedAt: restroom.community_verified_at,
      confirmationCount: restroom.community_verification_count,
      notFoundCount: restroom.community_not_found_count,
    },
    photos: photos
      .filter((photo) => !photo.review_id)
      .map((photo) => ({
        id: photo.id,
        url: photo.public_url,
        caption: photo.caption,
        displayName: displayNameById.get(photo.user_id) || "IWANNAPEE user",
        createdAt: photo.created_at,
      })),
    reviews: reviews.map((review) => ({
      id: review.id,
      overallRating: review.overall_rating,
      cleanlinessRating: review.cleanliness_rating,
      note: review.note,
      displayName: displayNameById.get(review.user_id) || "IWANNAPEE user",
      createdAt: review.created_at,
      updatedAt: review.updated_at,
      photos: photos
        .filter((photo) => photo.review_id === review.id)
        .map((photo) => ({ id: photo.id, url: photo.public_url, caption: photo.caption })),
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
