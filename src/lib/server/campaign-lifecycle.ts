import "server-only";

import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export type CampaignLifecycleAction = "stop" | "delete";

type CampaignLifecycleOptions = {
  action: CampaignLifecycleAction;
  actorId: string;
  campaignId: string;
  ownerId?: string;
};

type CampaignLifecycleRecord = {
  id: string;
  created_by: string;
  status: string;
  is_test: boolean;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  deleted_at: string | null;
};

export class CampaignLifecycleError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CampaignLifecycleError";
    this.status = status;
  }
}

function isMissingStripeResource(error: unknown) {
  return error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing";
}

function paymentIntentId(session: Stripe.Checkout.Session) {
  return typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
}

async function expirePendingCheckout(campaign: CampaignLifecycleRecord) {
  if (campaign.status !== "pending_payment" || !campaign.stripe_checkout_session_id || campaign.is_test) {
    return campaign.stripe_payment_intent_id;
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    throw new CampaignLifecycleError("Payments are temporarily unavailable. Please try again before removing this campaign.", 503);
  }

  const stripe = new Stripe(stripeSecret, { maxNetworkRetries: 2 });
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(campaign.stripe_checkout_session_id);
  } catch (error) {
    if (isMissingStripeResource(error)) return campaign.stripe_payment_intent_id;
    throw error;
  }

  if (
    session.client_reference_id !== campaign.id
    || session.metadata?.campaign_id !== campaign.id
    || session.metadata?.user_id !== campaign.created_by
  ) {
    throw new CampaignLifecycleError("The saved payment session does not match this campaign.", 409);
  }

  if (session.status === "open") {
    await stripe.checkout.sessions.expire(session.id);
  }

  return campaign.stripe_payment_intent_id || paymentIntentId(session);
}

export async function changeCampaignLifecycle({
  action,
  actorId,
  campaignId,
  ownerId,
}: CampaignLifecycleOptions) {
  const admin = createAdminClient();
  if (!admin) throw new CampaignLifecycleError("Supabase server access is not configured.", 503);

  let readQuery = admin
    .from("advertising_campaigns")
    .select("id,created_by,status,is_test,stripe_checkout_session_id,stripe_payment_intent_id,deleted_at")
    .eq("id", campaignId);
  if (ownerId) readQuery = readQuery.eq("created_by", ownerId);

  const { data, error: readError } = await readQuery.maybeSingle();
  const campaign = data as CampaignLifecycleRecord | null;
  if (readError) throw readError;
  if (!campaign) throw new CampaignLifecycleError("Campaign not found.", 404);
  if (campaign.deleted_at) {
    if (action === "delete") return { message: "Campaign is already deleted." };
    throw new CampaignLifecycleError("This campaign has already been deleted.", 409);
  }

  const isRunning = campaign.status === "active" || campaign.status === "pending_payment";
  if (action === "stop" && !isRunning) {
    throw new CampaignLifecycleError("This campaign is already stopped.", 409);
  }

  const stripePaymentIntentId = await expirePendingCheckout(campaign);
  const now = new Date().toISOString();
  const changes: Record<string, unknown> = {
    status: isRunning ? "cancelled" : campaign.status,
    updated_at: now,
  };
  if (isRunning) {
    changes.stopped_at = now;
    changes.stopped_by = actorId;
  }
  if (action === "delete") {
    changes.deleted_at = now;
    changes.deleted_by = actorId;
  }
  if (!campaign.stripe_payment_intent_id && stripePaymentIntentId) {
    changes.stripe_payment_intent_id = stripePaymentIntentId;
  }

  let updateQuery = admin
    .from("advertising_campaigns")
    .update(changes)
    .eq("id", campaign.id)
    .eq("status", campaign.status)
    .is("deleted_at", null);
  if (ownerId) updateQuery = updateQuery.eq("created_by", ownerId);
  const { data: updatedCampaign, error: updateError } = await updateQuery.select("id").maybeSingle();
  if (updateError) throw updateError;
  if (!updatedCampaign) {
    let latestQuery = admin
      .from("advertising_campaigns")
      .select("id,status,deleted_at")
      .eq("id", campaign.id);
    if (ownerId) latestQuery = latestQuery.eq("created_by", ownerId);
    const { data: latest, error: latestError } = await latestQuery.maybeSingle();
    if (latestError) throw latestError;
    if (!latest) throw new CampaignLifecycleError("Campaign not found.", 404);
    if (latest.deleted_at) {
      return { message: action === "delete" ? "Campaign is already deleted." : "Campaign is already stopped." };
    }

    const latestIsRunning = latest.status === "active" || latest.status === "pending_payment";
    const retryChanges: Record<string, unknown> = {
      status: latestIsRunning ? "cancelled" : latest.status,
      updated_at: now,
    };
    if (latestIsRunning || action === "stop") {
      retryChanges.stopped_at = now;
      retryChanges.stopped_by = actorId;
    }
    if (action === "delete") {
      retryChanges.deleted_at = now;
      retryChanges.deleted_by = actorId;
    }
    if (!campaign.stripe_payment_intent_id && stripePaymentIntentId) {
      retryChanges.stripe_payment_intent_id = stripePaymentIntentId;
    }

    let retryQuery = admin
      .from("advertising_campaigns")
      .update(retryChanges)
      .eq("id", campaign.id)
      .eq("status", latest.status)
      .is("deleted_at", null);
    if (ownerId) retryQuery = retryQuery.eq("created_by", ownerId);
    const { data: retryCampaign, error: retryError } = await retryQuery.select("id").maybeSingle();
    if (retryError) throw retryError;
    if (!retryCampaign) {
      throw new CampaignLifecycleError("The campaign changed while this action was being completed. Please refresh and try again.", 409);
    }
  }

  return {
    message: action === "delete"
      ? "Campaign deleted from your dashboard. No refund was issued."
      : "Campaign stopped. No refund was issued.",
  };
}
