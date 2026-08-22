import { captchaRequiredResponse, hasCaptchaSession } from "@/lib/security/captcha";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { InvalidBusinessImage, verifyBusinessImage } from "@/lib/server/business-storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function email(value: unknown) { const result = text(value, 254).toLowerCase(); return !result || /^\S+@\S+\.\S+$/.test(result) ? result || null : undefined; }
function url(value: unknown) {
  const result = text(value, 500);
  if (!result) return null;
  try { const parsed = new URL(result); return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : undefined; } catch { return undefined; }
}

export async function PATCH(request: Request) {
  if (!hasCaptchaSession(request)) return captchaRequiredResponse();
  const supabase = await createClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!data.user) return Response.json({ error: "Sign in to update your business profile." }, { status: 401 });
  const limit = await consumeRateLimit(request, { bucket: "business-profile", limit: 30, windowSeconds: 60 * 60, identifier: data.user.id, includeAddress: false });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Business profiles are not configured." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const profileId = text(body?.profileId, 36);
  const { data: profile, error: readError } = await admin.from("business_profiles").select("id,restroom_id,owner_user_id,profile_image_storage_path,cover_image_storage_path,launch_campaign_id").eq("id", profileId).eq("owner_user_id", data.user.id).maybeSingle();
  if (readError || !profile) return Response.json({ error: "Verified business profile not found." }, { status: 404 });

  const publicEmail = email(body?.publicEmail);
  const websiteUrl = url(body?.websiteUrl);
  const instagramUrl = url(body?.instagramUrl);
  const facebookUrl = url(body?.facebookUrl);
  const tiktokUrl = url(body?.tiktokUrl);
  if ([publicEmail, websiteUrl, instagramUrl, facebookUrl, tiktokUrl].some((value) => value === undefined)) return Response.json({ error: "Check the email and website/social URLs." }, { status: 400 });
  const businessName = text(body?.businessName, 120);
  if (businessName.length < 2) return Response.json({ error: "Enter a business name." }, { status: 400 });
  try {
    const [profileImage, coverImage] = await Promise.all([verifyBusinessImage(admin, data.user.id, body?.profileImagePath), verifyBusinessImage(admin, data.user.id, body?.coverImagePath)]);
    const changes: Record<string, unknown> = {
      business_name: businessName,
      description: text(body?.description, 1200) || null,
      website_url: websiteUrl,
      public_email: publicEmail,
      phone: text(body?.phone, 40) || null,
      instagram_url: instagramUrl,
      facebook_url: facebookUrl,
      tiktok_url: tiktokUrl,
      promotion_headline: text(body?.promotionHeadline, 100) || null,
      promotion_offer_text: text(body?.promotionOfferText, 280) || null,
      promotion_code: text(body?.promotionCode, 40) || null,
      updated_at: new Date().toISOString(),
    };
    if (profileImage === null) Object.assign(changes, { profile_image_url: null, profile_image_storage_path: null });
    else if (profileImage) Object.assign(changes, { profile_image_url: profileImage.publicUrl, profile_image_storage_path: profileImage.path });
    if (coverImage === null) Object.assign(changes, { cover_image_url: null, cover_image_storage_path: null });
    else if (coverImage) Object.assign(changes, { cover_image_url: coverImage.publicUrl, cover_image_storage_path: coverImage.path });
    const { error } = await admin.from("business_profiles").update(changes).eq("id", profile.id).eq("owner_user_id", data.user.id);
    if (error) throw error;

    if (profile.launch_campaign_id) {
      const { data: restroom } = await admin.from("restrooms").select("name,address,latitude,longitude,hours,hours_schedule_status,timezone,weekly_hours,directions").eq("id", profile.restroom_id).single();
      if (restroom) await admin.from("advertising_campaigns").update({ business_name: businessName, restroom_name: restroom.name, address: restroom.address, latitude: restroom.latitude, longitude: restroom.longitude, hours: restroom.hours, hours_schedule_status: restroom.hours_schedule_status, timezone: restroom.timezone, weekly_hours: restroom.weekly_hours, directions: restroom.directions, headline: changes.promotion_headline || "Community-verified restroom", offer_text: changes.promotion_offer_text || "A verified local business welcoming restroom visitors.", promo_code: changes.promotion_code, destination_url: websiteUrl, updated_at: new Date().toISOString() }).eq("id", profile.launch_campaign_id).eq("business_profile_id", profile.id);
    }
    const oldPaths = [profile.profile_image_storage_path, profile.cover_image_storage_path].filter((path): path is string => Boolean(path));
    const keptPaths = [profileImage && profileImage.path, coverImage && coverImage.path].filter(Boolean);
    const removable = oldPaths.filter((path) => !keptPaths.includes(path) && ((profileImage !== undefined && path === profile.profile_image_storage_path) || (coverImage !== undefined && path === profile.cover_image_storage_path)));
    if (removable.length) await admin.storage.from("business-creatives").remove(removable);
    return Response.json({ updated: true });
  } catch (error) {
    if (error instanceof InvalidBusinessImage) return Response.json({ error: error.message }, { status: 400 });
    console.error("Business profile update failed", { error: error instanceof Error ? error.message : "Unknown error" });
    return Response.json({ error: "The business profile could not be updated." }, { status: 500 });
  }
}
