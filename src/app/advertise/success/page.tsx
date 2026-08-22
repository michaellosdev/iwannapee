import type { Metadata } from "next";
import Link from "next/link";
import Stripe from "stripe";
import { ArrowRight, CheckCircle2, CircleAlert } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Advertising payment status",
  robots: { index: false, follow: false },
};

export default async function AdvertisingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  let active = false;
  const supabase = await createClient();
  const { data: authData } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null } };

  if (sessionId && process.env.STRIPE_SECRET_KEY && authData.user) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const campaignId = session.metadata?.campaign_id;
      const admin = createAdminClient();
      if (
        session.mode === "payment"
        && session.payment_status === "paid"
        && session.metadata?.user_id === authData.user.id
        && campaignId
        && admin
      ) {
        const { data } = await admin
          .from("advertising_campaigns")
          .select("status")
          .eq("id", campaignId)
          .eq("created_by", authData.user.id)
          .single();
        active = data?.status === "active";
      }
    } catch {
      active = false;
    }
  }

  return (
    <main className="checkout-result-page">
      <section className="checkout-result-card">
        <div className={active ? "checkout-result-icon paid" : "checkout-result-icon"}>
          {active ? <CheckCircle2 size={32} /> : <CircleAlert size={32} />}
        </div>
        <p className="eyebrow">Local advertising</p>
        <h1>{active ? "Your restroom promotion is live." : "We’re confirming your payment."}</h1>
        <p>
          {active
            ? "People within your selected radius can now see the offer, promo code, and QR destination attached to your restroom listing."
            : "If you completed checkout, Stripe may still be confirming the payment. Your promotion activates only after the signed webhook is received."}
        </p>
        <Link className="button button-primary" href="/">
          Return to the map <ArrowRight size={18} />
        </Link>
      </section>
    </main>
  );
}
