"use client";

import { useState } from "react";
import { ArrowRight, CreditCard, LoaderCircle } from "lucide-react";

type ResumePromotionPaymentButtonProps = {
  campaignId: string;
};

export function ResumePromotionPaymentButton({ campaignId }: ResumePromotionPaymentButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function resumePayment() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/business/checkout/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });
      const result = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !result.checkoutUrl) throw new Error(result.error || "Checkout could not be opened.");
      window.location.assign(result.checkoutUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Checkout could not be opened.");
      setLoading(false);
    }
  }

  return (
    <div className="business-payment-resume">
      <span className="business-payment-resume-icon" aria-hidden="true"><CreditCard size={19} /></span>
      <span className="business-payment-resume-copy">
        <strong>Finish your payment</strong>
        <small>Your promotion stays saved and will go live after Stripe confirms payment.</small>
        {error ? <small className="business-payment-resume-error" role="alert">{error}</small> : null}
      </span>
      <button className="button button-primary business-payment-resume-button" disabled={loading} onClick={resumePayment} type="button">
        {loading ? <LoaderCircle className="business-payment-resume-spinner" size={17} /> : <CreditCard size={17} />}
        {loading ? "Opening Stripe…" : "Complete payment"}
        {!loading ? <ArrowRight size={16} /> : null}
      </button>
    </div>
  );
}
