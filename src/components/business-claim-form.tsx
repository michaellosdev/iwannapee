"use client";

import { useState } from "react";
import { BadgeCheck, CheckCircle2, Mail, Send } from "lucide-react";
import { CaptchaWidget } from "@/components/captcha-widget";

type Props = { restroomId: string; restroomName: string; address: string; userEmail: string | null };

export function BusinessClaimForm({ restroomId, restroomName, address, userEmail }: Props) {
  const [captchaReady, setCaptchaReady] = useState(false);
  const [email, setEmail] = useState(userEmail || "");
  const [sent, setSent] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [proofEmailUrl, setProofEmailUrl] = useState("");

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError("");
    const response = await fetch("/api/auth/magic-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, returnTo: `/business/claim/${restroomId}` }) });
    const result = (await response.json()) as { error?: string; sent?: boolean };
    setWorking(false);
    if (!response.ok || !result.sent) return setError(result.error || "The sign-in link could not be sent.");
    setSent(true);
  }

  async function submitClaim(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/business/claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restroomId, businessName: form.get("businessName"), claimantRole: form.get("claimantRole"), businessEmail: form.get("businessEmail"), websiteUrl: form.get("websiteUrl"), proofDetails: form.get("proofDetails") }) });
    const result = (await response.json()) as { error?: string; submitted?: boolean; proofEmailUrl?: string };
    setWorking(false);
    if (!response.ok || !result.submitted) return setError(result.error || "The claim could not be submitted.");
    setProofEmailUrl(result.proofEmailUrl || "mailto:iwannapee@proton.me");
  }

  return (
    <section className="business-claim-shell">
      <div className="business-claim-summary"><span><BadgeCheck size={19} /> Free verified listing</span><h1>Claim {restroomName}</h1><p>{address}</p><ul><li>Verified business profile tied to this restroom</li><li>Printable Community Verified QR badge</li><li>One complimentary 7-day launch promotion</li><li>Private first-party promotion analytics</li></ul></div>
      {!userEmail ? (
        <form className="business-claim-form" onSubmit={sendMagicLink}>
          {sent ? <><CheckCircle2 size={30} /><h2>Check your inbox</h2><p>Open the secure link we sent to <strong>{email}</strong> to finish this claim.</p></> : <><p className="eyebrow">Step 1 of 2</p><h2>Sign in with your work email</h2><p>Your sign-in email stays private and will be attached to the claim for owner review.</p><label>Email address<input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label><CaptchaWidget onVerified={setCaptchaReady} />{error ? <p className="form-error">{error}</p> : null}<button className="button button-primary button-full" disabled={!captchaReady || working}><Mail size={17} /> {working ? "Sending…" : "Email me a magic link"}</button></>}
        </form>
      ) : proofEmailUrl ? (
        <div className="business-claim-form business-claim-success"><CheckCircle2 size={34} /><p className="eyebrow">Claim submitted</p><h2>Now email your proof.</h2><p>Your claim is in the owner queue. Send a business-license excerpt, utility bill, domain email, staff page, or another document that shows your connection to the business. Hide unrelated private information.</p><a className="button button-primary button-full" href={proofEmailUrl}><Send size={17} /> Email proof to IWANNAPEE</a><small>Approval is manual. A claim never becomes public until an owner verifies it.</small></div>
      ) : (
        <form className="business-claim-form" onSubmit={submitClaim}>
          <p className="eyebrow">Step 2 of 2</p><h2>Tell us how you’re connected</h2><p>Signed in as <strong>{userEmail}</strong>. This address stays private.</p>
          <label>Business name<input defaultValue={restroomName.replace(/\s+Restroom$/i, "")} maxLength={120} name="businessName" required /></label>
          <label>Your role<input maxLength={80} name="claimantRole" placeholder="Owner, manager, authorized employee…" required /></label>
          <label>Public business email <small>optional</small><input maxLength={254} name="businessEmail" type="email" /></label>
          <label>Business website <small>optional</small><input maxLength={500} name="websiteUrl" placeholder="https://" type="url" /></label>
          <label>Proof details <small>optional; do not include passwords or sensitive IDs</small><textarea maxLength={2000} name="proofDetails" placeholder="Tell us what proof you will email and how it connects you to this location." rows={5} /></label>
          <CaptchaWidget onVerified={setCaptchaReady} />{error ? <p className="form-error">{error}</p> : null}<button className="button button-primary button-full" disabled={!captchaReady || working}><Send size={17} /> {working ? "Submitting…" : "Submit claim"}</button>
        </form>
      )}
    </section>
  );
}
