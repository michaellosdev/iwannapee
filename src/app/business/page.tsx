import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Clipboard, ExternalLink, Eye, Megaphone, MousePointerClick, Plus, QrCode } from "lucide-react";
import { CampaignLifecycleControls } from "@/components/campaign-lifecycle-controls";
import { BusinessProfileManager } from "@/components/business-profile-manager";
import { ResumePromotionPaymentButton } from "@/components/resume-promotion-payment-button";
import { formatPrice } from "@/lib/advertising";
import { normalizePromotionColorKey, promotionColorClassName, type PromotionColorKey } from "@/lib/promotion-colors";
import type { PublicBusinessProfile } from "@/lib/public-directory";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Promotion analytics",
  robots: { index: false, follow: false },
};

type PromotionAnalyticsRow = {
  campaign_id: string;
  business_name: string;
  restroom_name: string;
  address: string;
  headline: string;
  status: string;
  is_test: boolean;
  is_complimentary: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  price_cents: number;
  placement_bid_cents: number;
  support_amount_cents: number;
  color_key: PromotionColorKey | null;
  impression_count: number | string;
  detail_open_count: number | string;
  promo_copy_count: number | string;
  qr_copy_count: number | string;
  website_click_count: number | string;
};

function metric(value: number | string) {
  return Number(value || 0).toLocaleString();
}

function dateLabel(value: string | null) {
  if (!value) return "Not started";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function BusinessAnalyticsPage() {
  const supabase = await createClient();
  const { data: authData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!authData.user || !supabase) redirect("/?business_account=1");

  const admin = createAdminClient();
  const [{ data, error }, profilesResult, claimsResult] = await Promise.all([
    supabase.rpc("business_promotion_analytics"),
    admin ? admin.from("business_profiles").select("id,restroom_id,business_name,description,profile_image_url,cover_image_url,website_url,public_email,phone,instagram_url,facebook_url,tiktok_url,promotion_headline,promotion_offer_text,promotion_code,verified_at,updated_at").eq("owner_user_id", authData.user.id).eq("status", "verified").order("verified_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    admin ? admin.from("business_claims").select("id,business_name,status,priority,created_at,restrooms(name,address)").eq("claimant_user_id", authData.user.id).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (error) throw new Error("Promotion analytics are temporarily unavailable");
  const campaigns = (data || []) as PromotionAnalyticsRow[];
  const profiles = (profilesResult.data || []) as PublicBusinessProfile[];
  const claims = (claimsResult.data || []) as Array<{ id: string; business_name: string; status: string; priority: string; created_at: string; restrooms: { name: string; address: string } | Array<{ name: string; address: string }> | null }>;
  const totals = campaigns.reduce((sum, campaign) => ({
    impressions: sum.impressions + Number(campaign.impression_count || 0),
    opens: sum.opens + Number(campaign.detail_open_count || 0),
    actions: sum.actions + Number(campaign.promo_copy_count || 0) + Number(campaign.qr_copy_count || 0) + Number(campaign.website_click_count || 0),
  }), { impressions: 0, opens: 0, actions: 0 });

  return (
    <main className="business-dashboard-page">
      <header className="business-dashboard-header">
        <div>
          <p className="eyebrow"><Megaphone size={14} /> Your promotions</p>
          <h1>Simple analytics, useful signals.</h1>
          <p>See when your restroom promotion appeared and what nearby visitors did next.</p>
        </div>
        <div>
          <Link className="button button-secondary" href="/"><ArrowLeft size={17} /> Back to map</Link>
          <Link className="button button-primary" href="/?business=1"><Plus size={17} /> New promotion</Link>
        </div>
      </header>

      {profiles.map((profile) => <BusinessProfileManager key={profile.id} profile={profile} />)}

      {claims.length > 0 ? (
        <section className="business-claims-status">
          <div><p className="eyebrow">Business claims</p><h2>Ownership review</h2><p>Claims are manually verified before a business profile or complimentary placement becomes public.</p></div>
          <div>{claims.map((claim) => {
            const restroom = Array.isArray(claim.restrooms) ? claim.restrooms[0] : claim.restrooms;
            return <article key={claim.id}><span className={`campaign-status campaign-status-${claim.status}`}>{claim.status.replaceAll("_", " ")}</span><strong>{claim.business_name}</strong><p>{restroom?.name || "Restroom listing"} · {restroom?.address || "Address unavailable"}</p><small>Submitted {dateLabel(claim.created_at)} · Claim {claim.id.slice(0, 8)}</small></article>;
          })}</div>
        </section>
      ) : null}

      <section className="business-dashboard-summary" aria-label="Promotion totals">
        <div><Eye size={21} /><span><strong>{totals.impressions.toLocaleString()}</strong><small>Appearances</small></span></div>
        <div><MousePointerClick size={21} /><span><strong>{totals.opens.toLocaleString()}</strong><small>Promotion opens</small></span></div>
        <div><ExternalLink size={21} /><span><strong>{totals.actions.toLocaleString()}</strong><small>Offer actions</small></span></div>
      </section>

      {campaigns.length > 0 ? (
        <section className="business-campaign-list" aria-label="Your promotion campaigns">
          {campaigns.map((campaign) => (
            <article className={`business-campaign-card ${promotionColorClassName(normalizePromotionColorKey(campaign.color_key))}`} key={campaign.campaign_id}>
              <div className="business-campaign-heading">
                <div>
                  <span className={`campaign-status campaign-status-${campaign.status}`}>{campaign.is_test ? "Test" : campaign.status.replaceAll("_", " ")}</span>
                  <h2>{campaign.restroom_name}</h2>
                  <p>{campaign.business_name} · {campaign.address}</p>
                </div>
                <div className="business-campaign-dates">
                  <span>{dateLabel(campaign.starts_at)}–{dateLabel(campaign.ends_at)}</span>
                  <small>{campaign.is_complimentary ? "Complimentary launch placement" : `${formatPrice(campaign.price_cents + campaign.placement_bid_cents)} campaign`}{campaign.support_amount_cents > 0 ? ` · ${formatPrice(campaign.support_amount_cents)} project support` : ""}</small>
                </div>
              </div>
              <p className="business-campaign-headline">“{campaign.headline}”</p>
              {campaign.status === "pending_payment" && !campaign.is_test ? (
                <ResumePromotionPaymentButton campaignId={campaign.campaign_id} />
              ) : null}
              <div className="business-campaign-metrics">
                <div><Eye size={17} /><span><strong>{metric(campaign.impression_count)}</strong><small>Appeared</small></span></div>
                <div><MousePointerClick size={17} /><span><strong>{metric(campaign.detail_open_count)}</strong><small>Opened</small></span></div>
                <div><Clipboard size={17} /><span><strong>{metric(campaign.promo_copy_count)}</strong><small>Promo copies</small></span></div>
                <div><QrCode size={17} /><span><strong>{metric(campaign.qr_copy_count)}</strong><small>QR copies</small></span></div>
                <div><ExternalLink size={17} /><span><strong>{metric(campaign.website_click_count)}</strong><small>Site clicks</small></span></div>
              </div>
              <CampaignLifecycleControls campaignId={campaign.campaign_id} status={campaign.status} />
            </article>
          ))}
        </section>
      ) : (
        <section className="business-dashboard-empty">
          <span><Megaphone size={28} /></span>
          <div><h2>No promotions yet.</h2><p>Create a local restroom promotion and its activity will appear here.</p></div>
          <Link className="button button-primary" href="/?business=1">Create your first promotion</Link>
        </section>
      )}

      <p className="business-analytics-note">Counts are first-party, privacy-conscious activity totals. Repeated actions from the same page view are counted once.</p>
    </main>
  );
}
