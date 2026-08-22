import Stripe from "stripe";
import { getOwnerAccess } from "@/lib/admin/authorization";
import { getAdvertisingOffer } from "@/lib/advertising";
import { formatHoursSchedule, normalizeHoursSchedule } from "@/lib/hours";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { CampaignLifecycleError, changeCampaignLifecycle } from "@/lib/server/campaign-lifecycle";
import { timeZoneAt } from "@/lib/server/timezone";
import { stripeKeyIsLive } from "@/lib/stripe/promotion-checkout";
import { createAdminClient } from "@/lib/supabase/admin";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validId(value: unknown) {
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const access = await getOwnerAccess();
  if (!access.user) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!access.authorized) return Response.json({ error: "Owner access required." }, { status: 403 });
  const limit = await consumeRateLimit(request, {
    bucket: "owner-actions",
    limit: 180,
    windowSeconds: 60 * 60,
    identifier: access.user.id,
    includeAddress: false,
  });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Supabase server access is not configured." }, { status: 503 });

  try {
    if (action === "restroom_status") {
      const id = validId(body?.id);
      const status = body?.status === "published" || body?.status === "rejected" ? body.status : null;
      if (!id || !status) throw new Error("Invalid restroom action");
      const { data: restroom, error: restroomReadError } = await admin.from("restrooms").select("id,created_by").eq("id", id).eq("status", "pending").single();
      if (restroomReadError || !restroom) throw restroomReadError || new Error("Restroom is no longer pending");
      const { error } = await admin.from("restrooms").update({ status, moderated_by: access.user.id, moderated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
      if (error) throw error;
      if (status === "published" && restroom.created_by) {
        const { error: verificationError } = await admin.from("restroom_verifications").upsert({
          restroom_id: id,
          user_id: restroom.created_by,
          verdict: "confirmed",
          updated_at: new Date().toISOString(),
        }, { onConflict: "restroom_id,user_id" });
        if (verificationError) throw verificationError;
      }
      return Response.json({ message: status === "published" ? "Restroom published." : "Restroom rejected." });
    }

    if (action === "update_status") {
      const id = validId(body?.id);
      const status = body?.status === "accepted" || body?.status === "rejected" ? body.status : null;
      if (!id || !status) throw new Error("Invalid correction action");
      const { data: update, error: readError } = await admin.from("restroom_updates").select("restroom_id,update_type,proposed_value,proposed_payload,status").eq("id", id).single();
      if (readError || !update || update.status !== "pending") throw readError || new Error("Correction is no longer pending");
      if (status === "accepted") {
        const { data: targetRestroom, error: restroomReadError } = await admin
          .from("restrooms")
          .select("latitude,longitude,features")
          .eq("id", update.restroom_id)
          .single();
        if (restroomReadError || !targetRestroom) throw restroomReadError || new Error("Restroom is no longer available");
        const payload = update.proposed_payload as { hoursSchedule?: unknown } | null;
        const hoursSchedule = update.update_type === "hours" && payload?.hoursSchedule
          ? normalizeHoursSchedule(payload.hoursSchedule, false)
          : null;
        const change = update.update_type === "code" ? {
            access_code: update.proposed_value,
            features: Array.from(new Set([...(targetRestroom.features || []), "Code available"])),
          }
          : update.update_type === "hours" ? (hoursSchedule ? {
                hours: formatHoursSchedule(hoursSchedule),
                hours_schedule_status: hoursSchedule.mode,
                timezone: hoursSchedule.mode === "scheduled" ? timeZoneAt(targetRestroom.latitude, targetRestroom.longitude) : null,
                weekly_hours: hoursSchedule.periods,
                is_open_now: null,
              } : {
                hours: update.proposed_value,
                hours_schedule_status: "unknown",
                timezone: null,
                weekly_hours: [],
                is_open_now: null,
              })
          : update.update_type === "access" ? { access_instructions: update.proposed_value }
          : update.update_type === "directions" ? { directions: update.proposed_value }
          : update.update_type === "description" ? { description: update.proposed_value }
          : update.update_type === "closed" ? { is_open_now: false, hours_schedule_status: "temporarily_closed" }
          : {};
        const { error: restroomError } = await admin.from("restrooms").update({ ...change, last_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", update.restroom_id);
        if (restroomError) throw restroomError;
      }
      const { error } = await admin.from("restroom_updates").update({ status }).eq("id", id).eq("status", "pending");
      if (error) throw error;
      return Response.json({ message: status === "accepted" ? "Correction applied." : "Correction rejected." });
    }

    if (action === "report_status") {
      const id = validId(body?.id);
      const status = body?.status === "resolved" || body?.status === "dismissed" ? body.status : null;
      if (!id || !status) throw new Error("Invalid report action");
      const { error } = await admin.from("reports").update({ status }).eq("id", id).eq("status", "open");
      if (error) throw error;
      return Response.json({ message: `Report ${status}.` });
    }

    if (action === "community_photo_status") {
      const id = validId(body?.id);
      const status = body?.status === "published" || body?.status === "rejected" ? body.status : null;
      if (!id || !status) throw new Error("Invalid community photo action");
      const { data: photo, error: photoReadError } = await admin
        .from("community_photos")
        .select("id,restroom_id,review_id,storage_path,public_url,status")
        .eq("id", id)
        .single();
      if (photoReadError || !photo || photo.status !== "pending") throw photoReadError || new Error("Photo is no longer pending");
      const { error } = await admin.from("community_photos").update({
        status,
        moderated_by: access.user.id,
        moderated_at: new Date().toISOString(),
      }).eq("id", id).eq("status", "pending");
      if (error) throw error;
      if (status === "published" && !photo.review_id) {
        const { error: coverError } = await admin.from("restrooms").update({
          cover_photo_url: photo.public_url,
          cover_photo_storage_path: photo.storage_path,
          updated_at: new Date().toISOString(),
        }).eq("id", photo.restroom_id).is("cover_photo_url", null);
        if (coverError) throw coverError;
      }
      if (status === "rejected") await admin.storage.from("restroom-photos").remove([photo.storage_path]);
      return Response.json({ message: status === "published" ? "Community photo published." : "Community photo rejected." });
    }

    if (action === "community_note_status") {
      const id = validId(body?.id);
      const status = body?.status === "published" || body?.status === "hidden" ? body.status : null;
      if (!id || !status) throw new Error("Invalid community note action");
      const { error } = await admin.from("community_notes").update({
        status,
        moderated_by: access.user.id,
        moderated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", id).in("status", ["published", "hidden"]);
      if (error) throw error;
      return Response.json({ message: status === "published" ? "Community note restored." : "Community note hidden." });
    }

    if (action === "profile_role") {
      const id = validId(body?.id);
      const role = body?.role === "user" || body?.role === "moderator" || body?.role === "owner" ? body.role : null;
      if (!id || !role || id === access.user.id) throw new Error("Invalid role change");
      const { error } = await admin.from("profiles").update({ role, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return Response.json({ message: `Role changed to ${role}.` });
    }

    if (action === "sample_create") {
      const latitude = Number(body?.latitude);
      const longitude = Number(body?.longitude);
      const offer = getAdvertisingOffer();
      const placementBidCents = Math.max(0, Math.min(offer.maxPlacementBidCents, Math.round(Number(body?.placementBidCents) || 0)));
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("Invalid sample coordinates");
      const now = new Date();
      const { data: sampleCampaign, error } = await admin.from("advertising_campaigns").insert({
        created_by: access.user.id,
        business_name: text(body?.businessName, 120) || "IWANNAPEE Test Business",
        restroom_name: text(body?.restroomName, 120) || "Sample sponsored restroom",
        address: text(body?.address, 240) || "Sample location",
        latitude,
        longitude,
        headline: text(body?.headline, 100) || "Owner-only placement test",
        offer_text: text(body?.offerText, 280) || "No-charge sponsored placement test.",
        promo_code: "TESTPEE",
        destination_url: process.env.NEXT_PUBLIC_SITE_URL || "https://www.iwannapee.lol",
        hours: "Open 24 hours",
        hours_schedule_status: "always_open",
        weekly_hours: [],
        radius_meters: offer.defaultRadiusMeters,
        price_cents: offer.priceCents,
        placement_bid_cents: placementBidCents,
        currency: "usd",
        duration_days: offer.durationDays,
        status: "active",
        is_test: true,
        starts_at: now.toISOString(),
        ends_at: new Date(now.getTime() + offer.durationDays * 24 * 60 * 60 * 1000).toISOString(),
      }).select("id").single();
      if (error || !sampleCampaign) throw error || new Error("Sample campaign was not created");
      const { error: restroomLinkError } = await admin.rpc("ensure_campaign_restroom", { p_campaign_id: sampleCampaign.id });
      if (restroomLinkError) throw restroomLinkError;
      return Response.json({ message: "Owner-only sample ad created. Search near its address to test placement." });
    }

    if (action === "campaign_stop" || action === "campaign_delete") {
      const id = validId(body?.id);
      if (!id) throw new CampaignLifecycleError("Invalid campaign.");
      const result = await changeCampaignLifecycle({
        action: action === "campaign_stop" ? "stop" : "delete",
        actorId: access.user.id,
        campaignId: id,
      });
      return Response.json({
        message: action === "campaign_delete"
          ? "Campaign removed from the advertiser dashboard. No refund was issued."
          : result.message,
      });
    }

    if (action === "campaign_refund") {
      const id = validId(body?.id);
      if (!id) throw new CampaignLifecycleError("Invalid campaign.");
      const stripeSecret = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecret) throw new CampaignLifecycleError("Stripe is not configured.", 503);
      if ((process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") && !stripeKeyIsLive(stripeSecret)) {
        throw new CampaignLifecycleError("A live Stripe key is required for production refunds.", 503);
      }

      const { data: campaign, error: campaignError } = await admin
        .from("advertising_campaigns")
        .select("id,status,is_test,stripe_payment_intent_id,refund_requested_at,payment_refunded_at")
        .eq("id", id)
        .maybeSingle();
      if (campaignError) throw campaignError;
      if (!campaign) throw new CampaignLifecycleError("Campaign not found.", 404);
      if (campaign.is_test) throw new CampaignLifecycleError("Test campaigns do not have a payment to refund.", 409);
      if (!campaign.stripe_payment_intent_id) throw new CampaignLifecycleError("No Stripe payment is attached to this campaign.", 409);
      if (campaign.status === "refunded" || campaign.payment_refunded_at) {
        throw new CampaignLifecycleError("This campaign has already been fully refunded.", 409);
      }
      if (campaign.refund_requested_at) {
        throw new CampaignLifecycleError("A full refund has already been requested for this campaign.", 409);
      }

      if (campaign.status === "active" || campaign.status === "pending_payment") {
        await changeCampaignLifecycle({ action: "stop", actorId: access.user.id, campaignId: campaign.id });
      }

      const stripe = new Stripe(stripeSecret, { maxNetworkRetries: 2 });
      const refund = await stripe.refunds.create({
        payment_intent: campaign.stripe_payment_intent_id,
        metadata: {
          campaign_id: campaign.id,
          refunded_by: access.user.id,
        },
      }, {
        idempotencyKey: `iwannapee-admin-full-refund-${campaign.id}-${campaign.stripe_payment_intent_id}`,
      });
      if (refund.status === "failed") {
        throw new CampaignLifecycleError("Stripe did not complete the refund. Review the payment in Stripe before trying another refund.", 502);
      }

      const now = new Date().toISOString();
      const { error: refundAuditError } = await admin.from("advertising_campaigns").update({
        refund_requested_at: now,
        refund_requested_by: access.user.id,
        updated_at: now,
      }).eq("id", campaign.id);
      if (refundAuditError) {
        console.error("Stripe refund succeeded but the local audit update failed", {
          campaignId: campaign.id,
          refundId: refund.id,
          error: refundAuditError.message,
        });
      }
      return Response.json({
        message: refund.status === "succeeded"
          ? "Full refund completed. Stripe will confirm the campaign status by webhook."
          : "Full refund submitted. Stripe will confirm the campaign status by webhook.",
      });
    }

    if (action === "sample_cancel") {
      const id = validId(body?.id);
      if (!id) throw new Error("Invalid sample campaign");
      const { error } = await admin.from("advertising_campaigns").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).eq("created_by", access.user.id).eq("is_test", true);
      if (error) throw error;
      return Response.json({ message: "Sample ad removed." });
    }

    return Response.json({ error: "Unknown owner action." }, { status: 400 });
  } catch (error) {
    console.error("Owner action failed", { action, error: error instanceof Error ? error.message : "Unknown error" });
    if (error instanceof CampaignLifecycleError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "The owner action could not be completed." }, { status: 400 });
  }
}
