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
  if (!authData.user) return Response.json({ error: "Sign in before adding restroom photos." }, { status: 401 });

  const limit = await consumeRateLimit(request, {
    bucket: "community-restroom-photo",
    limit: 12,
    windowSeconds: 60 * 60,
    identifier: authData.user.id,
    includeAddress: false,
  });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as { restroomId?: unknown; photoStoragePaths?: unknown; caption?: unknown } | null;
  const restroomId = typeof body?.restroomId === "string" ? body.restroomId : "";
  const caption = typeof body?.caption === "string" ? body.caption.trim() : "";
  if (!uuidPattern.test(restroomId) || caption.length > 240) {
    return Response.json({ error: "Check the restroom photo details." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Community photos are unavailable." }, { status: 503 });
  let paths: string[] = [];
  try {
    const photos = await verifyUploadedPhotos(admin, authData.user.id, body?.photoStoragePaths, 3);
    paths = photos.map((photo) => photo.path);
    if (photos.length === 0) throw new InvalidStoredPhoto("Choose at least one photo.");

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
      throw new InvalidStoredPhoto("This restroom is not accepting community photos.");
    }
    const { count } = await admin
      .from("community_photos")
      .select("id", { count: "exact", head: true })
      .eq("restroom_id", restroomId)
      .eq("user_id", authData.user.id)
      .is("review_id", null)
      .in("status", ["pending", "published"]);
    if ((count || 0) + photos.length > 8) throw new InvalidStoredPhoto("You can contribute up to eight photos to one restroom.");

    const { error } = await admin.from("community_photos").insert(photos.map((photo) => ({
      restroom_id: restroomId,
      user_id: authData.user.id,
      storage_path: photo.path,
      public_url: photo.publicUrl,
      caption: caption || null,
      status: "pending",
    })));
    if (error) throw error;
    return Response.json({ submitted: true, photoCount: photos.length });
  } catch (error) {
    await removeUploadedPhotos(admin, paths);
    if (error instanceof InvalidStoredPhoto) return Response.json({ error: error.message }, { status: 400 });
    console.error("Community photo submission failed", { error: error instanceof Error ? error.message : "Unknown error" });
    return Response.json({ error: "We couldn’t submit these photos." }, { status: 500 });
  }
}
