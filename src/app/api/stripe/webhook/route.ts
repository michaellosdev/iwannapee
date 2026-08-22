import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

async function activateCampaign(session: Stripe.Checkout.Session) {
  if (session.mode !== "payment" || session.payment_status !== "paid") return;
  const campaignId = session.metadata?.campaign_id;
  if (!campaignId) return;

  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase secret key is not configured");

  const { data: campaign, error } = await admin
    .from("advertising_campaigns")
    .select("id,created_by,duration_days,status,price_cents,placement_bid_cents,support_amount_cents,currency,stripe_checkout_session_id")
    .eq("id", campaignId)
    .single();
  if (error || !campaign || campaign.status !== "pending_payment") return;

  const expectedAmount = campaign.price_cents + campaign.placement_bid_cents + campaign.support_amount_cents;
  if (
    session.client_reference_id !== campaign.id
    || session.id !== campaign.stripe_checkout_session_id
    || session.amount_total !== expectedAmount
    || session.currency !== campaign.currency
    || session.metadata?.user_id !== campaign.created_by
    || session.metadata?.placement_bid_cents !== String(campaign.placement_bid_cents)
    || session.metadata?.support_amount_cents !== String(campaign.support_amount_cents)
    || session.metadata?.total_price_cents !== String(expectedAmount)
  ) {
    throw new Error("Paid Checkout Session does not match the campaign total");
  }

  const { error: restroomLinkError } = await admin.rpc("ensure_campaign_restroom", {
    p_campaign_id: campaign.id,
  });
  if (restroomLinkError) throw restroomLinkError;

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + campaign.duration_days * 24 * 60 * 60 * 1000);
  const { error: activationError } = await admin
    .from("advertising_campaigns")
    .update({
      status: "active",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      updated_at: startsAt.toISOString(),
    })
    .eq("id", campaignId)
    .eq("status", "pending_payment");
  if (activationError) throw activationError;
}

async function cancelPendingCampaign(session: Stripe.Checkout.Session) {
  const campaignId = session.metadata?.campaign_id;
  if (!campaignId) return;
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase secret key is not configured");
  const { error } = await admin
    .from("advertising_campaigns")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", "pending_payment");
  if (error) throw error;
}

function paymentIntentId(value: string | Stripe.PaymentIntent | null) {
  return typeof value === "string" ? value : value?.id || null;
}

async function claimEvent(event: Stripe.Event) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase secret key is not configured");
  const { error: insertError } = await admin.from("stripe_webhook_events").insert({
    event_id: event.id,
    event_type: event.type,
    status: "processing",
  });
  if (!insertError) return { claimed: true, processed: false };
  if (insertError.code !== "23505") throw insertError;

  const { data: existing, error: selectError } = await admin
    .from("stripe_webhook_events")
    .select("status,attempt_count")
    .eq("event_id", event.id)
    .single();
  if (selectError || !existing) throw selectError || new Error("Webhook event receipt is unavailable");
  if (existing.status === "processed") return { claimed: false, processed: true };
  if (existing.status === "processing") return { claimed: false, processed: false };

  const { error: retryError } = await admin.from("stripe_webhook_events").update({
    status: "processing",
    attempt_count: Number(existing.attempt_count || 1) + 1,
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("event_id", event.id).eq("status", "failed");
  if (retryError) throw retryError;
  return { claimed: true, processed: false };
}

async function finishEvent(event: Stripe.Event, error?: unknown) {
  const admin = createAdminClient();
  if (!admin) return;
  const now = new Date().toISOString();
  await admin.from("stripe_webhook_events").update(error ? {
    status: "failed",
    last_error: error instanceof Error ? error.message.slice(0, 500) : "Unknown processing error",
    updated_at: now,
  } : {
    status: "processed",
    last_error: null,
    processed_at: now,
    updated_at: now,
  }).eq("event_id", event.id);
}

async function markFullyRefunded(charge: Stripe.Charge) {
  if (!charge.refunded) return;
  const intentId = paymentIntentId(charge.payment_intent);
  if (!intentId) return;
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase secret key is not configured");

  const now = new Date().toISOString();
  const { error } = await admin
    .from("advertising_campaigns")
    .update({ status: "refunded", payment_refunded_at: now, updated_at: now })
    .eq("stripe_payment_intent_id", intentId)
    .in("status", ["active", "expired", "disputed"]);
  if (error) throw error;
}

async function markDisputed(dispute: Stripe.Dispute) {
  const intentId = paymentIntentId(dispute.payment_intent);
  if (!intentId) return;
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase secret key is not configured");

  const now = new Date().toISOString();
  const { error } = await admin
    .from("advertising_campaigns")
    .update({ status: "disputed", payment_disputed_at: now, updated_at: now })
    .eq("stripe_payment_intent_id", intentId)
    .in("status", ["active", "expired"]);
  if (error) throw error;
}

export async function POST(request: Request) {
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!stripeSecret || !webhookSecret || !signature) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  }

  const payload = await request.text();
  const stripe = new Stripe(stripeSecret, { maxNetworkRetries: 2 });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  try {
    const receipt = await claimEvent(event);
    if (receipt.processed) return NextResponse.json({ received: true, duplicate: true });
    if (!receipt.claimed) {
      return NextResponse.json({ error: "Webhook event is already processing." }, { status: 409 });
    }
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await activateCampaign(event.data.object);
    } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
      await cancelPendingCampaign(event.data.object);
    } else if (event.type === "charge.refunded") {
      await markFullyRefunded(event.data.object);
    } else if (event.type === "charge.dispute.created") {
      await markDisputed(event.data.object);
    }
    await finishEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    await finishEvent(event, error);
    console.error("Stripe webhook processing failed", {
      eventId: event.id,
      eventType: event.type,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
