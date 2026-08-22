import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdvertisingOffer } from "@/lib/advertising";
import { captchaRequiredResponse, hasCaptchaSession } from "@/lib/security/captcha";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type CheckoutBody = {
  businessName?: unknown;
  restroomName?: unknown;
  address?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  hours?: unknown;
  directions?: unknown;
  headline?: unknown;
  offerText?: unknown;
  promoCode?: unknown;
  qrTargetUrl?: unknown;
  destinationUrl?: unknown;
  radiusMiles?: unknown;
  placementBidCents?: unknown;
};

class InvalidCampaignError extends Error {}

function textField(value: unknown, label: string, minimum: number, maximum: number, required = true) {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && text.length < minimum) throw new InvalidCampaignError(`${label} is required.`);
  if (text.length > maximum) throw new InvalidCampaignError(`${label} is too long.`);
  return text;
}

function urlField(value: unknown, label: string) {
  const text = textField(value, label, 0, 500, false);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("Unsupported protocol");
    return parsed.toString();
  } catch {
    throw new InvalidCampaignError(`${label} must be a complete web address.`);
  }
}

export async function POST(request: Request) {
  if (!hasCaptchaSession(request)) return captchaRequiredResponse();
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return NextResponse.json({ error: "Sign in before creating an advertisement." }, { status: 401 });

  const limit = await consumeRateLimit(request, {
    bucket: "advertising-checkout",
    limit: 10,
    windowSeconds: 60 * 60,
    identifier: authData.user.id,
    includeAddress: false,
  });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) return NextResponse.json({ error: "Stripe Checkout is not configured yet." }, { status: 503 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Supabase server access is not configured yet." }, { status: 503 });

  try {
    const body = (await request.json()) as CheckoutBody;
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new InvalidCampaignError("Place the restroom pin before continuing.");
    }

    const radiusMiles = Math.max(1, Math.min(15, Number(body.radiusMiles) || 5));
    const radiusMeters = Math.round(radiusMiles * 1609.344);
    const offer = getAdvertisingOffer();
    const requestedBid = Number(body.placementBidCents);
    const placementBidCents = Number.isFinite(requestedBid)
      ? Math.max(0, Math.min(offer.maxPlacementBidCents, Math.round(requestedBid)))
      : 0;
    const totalPriceCents = offer.priceCents + placementBidCents;
    const campaign = {
      created_by: authData.user.id,
      business_name: textField(body.businessName, "Business name", 2, 120),
      restroom_name: textField(body.restroomName, "Restroom name", 2, 120),
      address: textField(body.address, "Address", 5, 240),
      latitude,
      longitude,
      hours: textField(body.hours, "Hours", 0, 160, false) || null,
      directions: textField(body.directions, "Directions", 0, 500, false) || null,
      headline: textField(body.headline, "Headline", 4, 100),
      offer_text: textField(body.offerText, "Offer", 4, 280),
      promo_code: textField(body.promoCode, "Promo code", 0, 40, false).toUpperCase() || null,
      qr_target_url: urlField(body.qrTargetUrl, "QR destination"),
      destination_url: urlField(body.destinationUrl, "Business website"),
      radius_meters: radiusMeters,
      price_cents: offer.priceCents,
      placement_bid_cents: placementBidCents,
      currency: "usd",
      duration_days: offer.durationDays,
      status: "pending_payment",
    };

    const { data: createdCampaign, error: insertError } = await admin
      .from("advertising_campaigns")
      .insert(campaign)
      .select("id")
      .single();
    if (insertError || !createdCampaign) throw new Error("Could not save campaign");

    const stripe = new Stripe(stripeSecret, { maxNetworkRetries: 2 });
    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const siteUrl = configuredSiteUrl?.startsWith("http") ? configuredSiteUrl.replace(/\/$/, "") : new URL(request.url).origin;
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: offer.priceCents,
          product_data: {
            name: "IWANNAPEE sponsored restroom listing",
            description: `${offer.durationDays}-day location-based promotion for ${campaign.business_name}`,
          },
        },
      },
    ];
    if (placementBidCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: placementBidCents,
          product_data: {
            name: "IWANNAPEE priority placement bid",
            description: "One-time bid for ranking within eligible local sponsored slots",
          },
        },
      });
    }

    try {
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          integration_identifier: process.env.STRIPE_INTEGRATION_IDENTIFIER || "iwannapee_qnrvkzpt",
          client_reference_id: createdCampaign.id,
          customer_email: authData.user.email,
          success_url: `${siteUrl}/business/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${siteUrl}/?business=1&checkout=cancelled`,
          line_items: lineItems,
          metadata: {
            campaign_id: createdCampaign.id,
            user_id: authData.user.id,
            placement_bid_cents: String(placementBidCents),
            total_price_cents: String(totalPriceCents),
          },
          payment_intent_data: {
            metadata: {
              campaign_id: createdCampaign.id,
              user_id: authData.user.id,
              placement_bid_cents: String(placementBidCents),
            },
          },
        },
        { idempotencyKey: `iwannapee-checkout-${createdCampaign.id}` },
      );

      const { error: sessionUpdateError } = await admin
        .from("advertising_campaigns")
        .update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
        .eq("id", createdCampaign.id);
      if (sessionUpdateError) {
        await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
        throw new Error("Checkout Session could not be attached to campaign");
      }

      if (!session.url) throw new Error("Checkout URL was not returned");
      return NextResponse.json({ checkoutUrl: session.url });
    } catch {
      await admin
        .from("advertising_campaigns")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", createdCampaign.id);
      throw new Error("Checkout could not be created");
    }
  } catch (error) {
    if (error instanceof InvalidCampaignError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "We couldn’t start checkout. Please try again." }, { status: 500 });
  }
}
