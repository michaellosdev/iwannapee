import { NextResponse } from "next/server";
import Stripe from "stripe";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import {
  checkoutSessionMatchesCampaign,
  checkoutSessionMatchesSite,
  createPromotionCheckoutSession,
  promotionCheckoutConfigurationError,
  promotionCheckoutSiteUrl,
  type PromotionCheckoutCampaign,
} from "@/lib/stripe/promotion-checkout";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ResumeCheckoutBody = {
  campaignId?: unknown;
};

type PendingCampaign = PromotionCheckoutCampaign & {
  status: string;
  stripe_checkout_session_id: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function successUrl(siteUrl: string, sessionId: string) {
  return `${siteUrl}/business/success?session_id=${encodeURIComponent(sessionId)}`;
}

function isMissingStripeResource(error: unknown) {
  return error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing";
}

async function retrieveAttachedSession(stripe: Stripe, sessionId: string | null) {
  if (!sessionId) return null;
  try {
    return await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    if (isMissingStripeResource(error)) return null;
    throw error;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Sign in to continue this promotion payment." }, { status: 401 });
  }

  const limit = await consumeRateLimit(request, {
    bucket: "advertising-checkout-resume",
    limit: 20,
    windowSeconds: 60 * 60,
    identifier: authData.user.id,
    includeAddress: false,
  });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const admin = createAdminClient();
  if (!stripeSecret) return NextResponse.json({ error: "Stripe Checkout is not configured yet." }, { status: 503 });
  const siteUrl = promotionCheckoutSiteUrl(request.url);
  const checkoutConfigurationError = promotionCheckoutConfigurationError(stripeSecret, siteUrl);
  if (checkoutConfigurationError) {
    console.error("Promotion checkout resume configuration is unsafe", { error: checkoutConfigurationError });
    return NextResponse.json({ error: "Live payment checkout is temporarily unavailable." }, { status: 503 });
  }
  if (!admin) return NextResponse.json({ error: "Supabase server access is not configured yet." }, { status: 503 });

  let campaignId: string;
  try {
    const body = (await request.json()) as ResumeCheckoutBody;
    campaignId = typeof body.campaignId === "string" ? body.campaignId.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!UUID_PATTERN.test(campaignId)) {
    return NextResponse.json({ error: "Invalid promotion." }, { status: 400 });
  }

  const { data, error: campaignError } = await admin
    .from("advertising_campaigns")
    .select("id,created_by,business_name,duration_days,price_cents,placement_bid_cents,support_amount_cents,currency,status,stripe_checkout_session_id")
    .eq("id", campaignId)
    .eq("created_by", authData.user.id)
    .eq("status", "pending_payment")
    .maybeSingle();
  const campaign = data as PendingCampaign | null;
  if (campaignError || !campaign) {
    return NextResponse.json({ error: "This promotion is no longer awaiting payment." }, { status: 404 });
  }

  const stripe = new Stripe(stripeSecret, { maxNetworkRetries: 2 });

  try {
    const attachedSession = await retrieveAttachedSession(stripe, campaign.stripe_checkout_session_id);
    if (attachedSession && !checkoutSessionMatchesCampaign(attachedSession, campaign)) {
      return NextResponse.json({ error: "The saved checkout does not match this promotion." }, { status: 409 });
    }
    const attachedSessionMatchesSite = attachedSession
      ? checkoutSessionMatchesSite(attachedSession, siteUrl, stripeSecret)
      : false;
    if (attachedSession?.status === "open" && attachedSession.url && attachedSessionMatchesSite) {
      return NextResponse.json({ checkoutUrl: attachedSession.url });
    }
    if (attachedSession?.status === "complete" && attachedSessionMatchesSite) {
      return NextResponse.json({ checkoutUrl: successUrl(siteUrl, attachedSession.id) });
    }
    if (attachedSession?.status === "open") {
      await stripe.checkout.sessions.expire(attachedSession.id);
    }

    const priorSessionKey = campaign.stripe_checkout_session_id || "missing";
    const replacement = await createPromotionCheckoutSession({
      campaign,
      customerEmail: authData.user.email,
      idempotencyKey: `iwannapee-checkout-resume-${campaign.id}-${priorSessionKey}`,
      siteUrl,
      stripe,
    });
    if (!replacement.url) throw new Error("Checkout URL was not returned");

    let attachQuery = admin
      .from("advertising_campaigns")
      .update({ stripe_checkout_session_id: replacement.id, updated_at: new Date().toISOString() })
      .eq("id", campaign.id)
      .eq("created_by", authData.user.id)
      .eq("status", "pending_payment");
    attachQuery = campaign.stripe_checkout_session_id
      ? attachQuery.eq("stripe_checkout_session_id", campaign.stripe_checkout_session_id)
      : attachQuery.is("stripe_checkout_session_id", null);
    const { data: attachedCampaign, error: attachError } = await attachQuery.select("id").maybeSingle();
    if (!attachError && attachedCampaign) {
      return NextResponse.json({ checkoutUrl: replacement.url });
    }

    const { data: latest } = await admin
      .from("advertising_campaigns")
      .select("status,stripe_checkout_session_id")
      .eq("id", campaign.id)
      .eq("created_by", authData.user.id)
      .maybeSingle();
    if (latest?.status === "pending_payment" && latest.stripe_checkout_session_id === replacement.id) {
      return NextResponse.json({ checkoutUrl: replacement.url });
    }
    if (latest?.status === "pending_payment" && latest.stripe_checkout_session_id) {
      const latestSession = await retrieveAttachedSession(stripe, latest.stripe_checkout_session_id);
      if (
        latestSession
        && checkoutSessionMatchesCampaign(latestSession, campaign)
        && checkoutSessionMatchesSite(latestSession, siteUrl, stripeSecret)
      ) {
        if (latestSession.status === "open" && latestSession.url) {
          return NextResponse.json({ checkoutUrl: latestSession.url });
        }
        if (latestSession.status === "complete") {
          return NextResponse.json({ checkoutUrl: successUrl(siteUrl, latestSession.id) });
        }
      }
    }

    await stripe.checkout.sessions.expire(replacement.id).catch(() => undefined);
    return NextResponse.json({ error: "The promotion changed while payment was opening. Please try again." }, { status: 409 });
  } catch (error) {
    console.error("Promotion checkout could not be resumed", {
      campaignId: campaign.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "We couldn’t reopen checkout. Please try again." }, { status: 502 });
  }
}
