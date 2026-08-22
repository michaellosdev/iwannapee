import "server-only";

import Stripe from "stripe";
import { SITE_URL } from "@/lib/site";

export type PromotionCheckoutCampaign = {
  id: string;
  created_by: string;
  business_name: string;
  duration_days: number;
  price_cents: number;
  placement_bid_cents: number;
  support_amount_cents: number;
  currency: string;
};

export function promotionCheckoutTotal(campaign: PromotionCheckoutCampaign) {
  return campaign.price_cents + campaign.placement_bid_cents + campaign.support_amount_cents;
}

export function promotionCheckoutSiteUrl(requestUrl: string) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  return configuredSiteUrl?.startsWith("http")
    ? configuredSiteUrl.replace(/\/$/, "")
    : new URL(requestUrl).origin;
}

export function stripeKeyIsLive(secret: string) {
  return secret.startsWith("sk_live_") || secret.startsWith("rk_live_");
}

export function promotionCheckoutConfigurationError(secret: string, siteUrl: string) {
  if (process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production") return null;
  if (!stripeKeyIsLive(secret)) return "Production checkout requires a live Stripe key.";
  if (siteUrl !== SITE_URL) return `Production checkout requires NEXT_PUBLIC_SITE_URL=${SITE_URL}.`;
  return null;
}

export function checkoutSessionMatchesCampaign(
  session: Stripe.Checkout.Session,
  campaign: PromotionCheckoutCampaign,
) {
  const total = promotionCheckoutTotal(campaign);
  return session.mode === "payment"
    && session.client_reference_id === campaign.id
    && session.metadata?.campaign_id === campaign.id
    && session.metadata?.user_id === campaign.created_by
    && session.metadata?.placement_bid_cents === String(campaign.placement_bid_cents)
    && session.metadata?.support_amount_cents === String(campaign.support_amount_cents)
    && session.metadata?.total_price_cents === String(total)
    && session.amount_subtotal === total
    && session.amount_total !== null
    && session.amount_total >= 0
    && session.amount_total <= total
    && session.currency === campaign.currency;
}

export function checkoutSessionMatchesSite(
  session: Stripe.Checkout.Session,
  siteUrl: string,
  stripeSecret: string,
) {
  return session.livemode === stripeKeyIsLive(stripeSecret)
    && session.allow_promotion_codes === true
    && session.consent_collection?.terms_of_service === "required"
    && session.success_url === `${siteUrl}/business/success?session_id={CHECKOUT_SESSION_ID}`
    && session.cancel_url === `${siteUrl}/business`;
}

export async function createPromotionCheckoutSession({
  campaign,
  customerEmail,
  idempotencyKey,
  siteUrl,
  stripe,
}: {
  campaign: PromotionCheckoutCampaign;
  customerEmail?: string;
  idempotencyKey: string;
  siteUrl: string;
  stripe: Stripe;
}) {
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      quantity: 1,
      price_data: {
        currency: campaign.currency,
        unit_amount: campaign.price_cents,
        product_data: {
          name: "IWANNAPEE sponsored restroom listing",
          description: `${campaign.duration_days}-day location-based promotion for ${campaign.business_name}`,
        },
      },
    },
  ];

  if (campaign.placement_bid_cents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: campaign.currency,
        unit_amount: campaign.placement_bid_cents,
        product_data: {
          name: "IWANNAPEE priority placement bid",
          description: "One-time bid for ranking within eligible local sponsored slots",
        },
      },
    });
  }

  if (campaign.support_amount_cents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: campaign.currency,
        unit_amount: campaign.support_amount_cents,
        product_data: {
          name: "Support IWANNAPEE",
          description: "Optional project support for better restroom data and map improvements",
        },
      },
    });
  }

  return stripe.checkout.sessions.create(
    {
      mode: "payment",
      integration_identifier: process.env.STRIPE_INTEGRATION_IDENTIFIER || "iwannapee_qnrvkzpt",
      client_reference_id: campaign.id,
      customer_email: customerEmail,
      allow_promotion_codes: true,
      consent_collection: {
        terms_of_service: "required",
      },
      success_url: `${siteUrl}/business/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/business`,
      line_items: lineItems,
      metadata: {
        campaign_id: campaign.id,
        user_id: campaign.created_by,
        placement_bid_cents: String(campaign.placement_bid_cents),
        support_amount_cents: String(campaign.support_amount_cents),
        total_price_cents: String(promotionCheckoutTotal(campaign)),
      },
      payment_intent_data: {
        metadata: {
          campaign_id: campaign.id,
          user_id: campaign.created_by,
          placement_bid_cents: String(campaign.placement_bid_cents),
          support_amount_cents: String(campaign.support_amount_cents),
        },
      },
    },
    { idempotencyKey },
  );
}
