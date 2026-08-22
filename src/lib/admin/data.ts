import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function getAdminDashboardData() {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase server access is not configured");

  const [profilesResult, usersResult, restroomsResult, updatesResult, reportsResult, campaignsResult, photosResult, notesResult, claimsResult, businessProfilesResult, prioritiesResult] = await Promise.all([
    admin.from("profiles").select("id,display_name,role,is_moderator,created_at").order("created_at", { ascending: false }).limit(200),
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin.from("restrooms").select("id,name,address,description,directions,hours,hours_schedule_status,timezone,weekly_hours,latitude,longitude,is_open_now,access_code,access_instructions,cover_photo_url,features,created_by,created_at,status,data_source,source_url,last_verified_at").eq("status", "pending").order("created_at", { ascending: true }).limit(100),
    admin.from("restroom_updates").select("id,restroom_id,user_id,update_type,proposed_value,status,upvote_count,downvote_count,created_at").eq("status", "pending").order("upvote_count", { ascending: false }).order("created_at", { ascending: true }).limit(100),
    admin.from("reports").select("id,restroom_id,user_id,reason,details,status,created_at").eq("status", "open").order("created_at", { ascending: true }).limit(100),
    admin.from("advertising_campaigns").select("id,created_by,business_name,restroom_name,address,headline,offer_text,price_cents,placement_bid_cents,support_amount_cents,status,is_test,is_complimentary,stripe_payment_intent_id,starts_at,ends_at,stopped_at,deleted_at,refund_requested_at,payment_refunded_at,created_at").order("created_at", { ascending: false }).limit(100),
    admin.from("community_photos").select("id,restroom_id,review_id,user_id,public_url,caption,status,created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(100),
    admin.from("community_notes").select("id,restroom_id,parent_id,user_id,body,status,upvote_count,downvote_count,created_at").in("status", ["published", "hidden"]).order("created_at", { ascending: false }).limit(100),
    admin.from("business_claims").select("id,restroom_id,claimant_user_id,business_name,claimant_role,contact_email,business_email,website_url,proof_details,status,priority,admin_notes,created_at,updated_at").in("status", ["pending", "needs_info"]).order("created_at", { ascending: true }).limit(200),
    admin.from("business_profiles").select("id,restroom_id,owner_user_id,business_name,description,profile_image_url,cover_image_url,website_url,public_email,phone,instagram_url,facebook_url,tiktok_url,promotion_headline,promotion_offer_text,promotion_code,status,verified_at,updated_at").order("verified_at", { ascending: false }).limit(200),
    admin.from("admin_queue_priorities").select("resource_type,resource_id,priority,note,updated_at").limit(1000),
  ]);

  const firstError = [profilesResult.error, usersResult.error, restroomsResult.error, updatesResult.error, reportsResult.error, campaignsResult.error, photosResult.error, notesResult.error, claimsResult.error, businessProfilesResult.error, prioritiesResult.error].find(Boolean);
  if (firstError) throw firstError;

  const emailById = new Map(usersResult.data.users.map((user) => [user.id, user.email || "No email"]));
  const nameByRestroomId = new Map((restroomsResult.data || []).map((restroom) => [restroom.id, restroom.name]));
  const relatedIds = Array.from(new Set([
    ...(updatesResult.data || []).map((item) => item.restroom_id),
    ...(reportsResult.data || []).map((item) => item.restroom_id),
    ...(photosResult.data || []).map((item) => item.restroom_id),
    ...(notesResult.data || []).map((item) => item.restroom_id),
    ...(claimsResult.data || []).map((item) => item.restroom_id),
    ...(businessProfilesResult.data || []).map((item) => item.restroom_id),
  ])).filter((id) => !nameByRestroomId.has(id));
  if (relatedIds.length > 0) {
    const { data: related } = await admin.from("restrooms").select("id,name").in("id", relatedIds);
    for (const restroom of related || []) nameByRestroomId.set(restroom.id, restroom.name);
  }

  return {
    profiles: (profilesResult.data || []).map((profile) => ({ ...profile, email: emailById.get(profile.id) || "No email" })),
    restrooms: restroomsResult.data || [],
    updates: (updatesResult.data || []).map((item) => ({ ...item, restroom_name: nameByRestroomId.get(item.restroom_id) || "Unknown restroom" })),
    reports: (reportsResult.data || []).map((item) => ({ ...item, restroom_name: nameByRestroomId.get(item.restroom_id) || "Unknown restroom" })),
    campaigns: (campaignsResult.data || []).map((campaign) => ({
      ...campaign,
      creator_email: emailById.get(campaign.created_by) || "Unknown user",
    })),
    photos: (photosResult.data || []).map((photo) => ({
      ...photo,
      restroom_name: nameByRestroomId.get(photo.restroom_id) || "Unknown restroom",
      contributor: emailById.get(photo.user_id) || "IWANNAPEE user",
    })),
    notes: (notesResult.data || []).map((note) => ({
      ...note,
      restroom_name: nameByRestroomId.get(note.restroom_id) || "Unknown restroom",
      contributor: emailById.get(note.user_id) || "IWANNAPEE user",
    })),
    claims: (claimsResult.data || []).map((claim) => ({
      ...claim,
      restroom_name: nameByRestroomId.get(claim.restroom_id) || "Unknown restroom",
      claimant_email: emailById.get(claim.claimant_user_id) || claim.contact_email,
    })),
    businessProfiles: (businessProfilesResult.data || []).map((profile) => ({
      ...profile,
      restroom_name: nameByRestroomId.get(profile.restroom_id) || "Unknown restroom",
      owner_email: emailById.get(profile.owner_user_id) || "Unknown user",
    })),
    priorities: prioritiesResult.data || [],
  };
}
