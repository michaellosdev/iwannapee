import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, LegalSection, SUPPORT_EMAIL } from "@/components/legal-page-shell";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "Refund and campaign-cancellation rules for one-time IWANNAPEE business promotions.",
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicyPage() {
  return (
    <LegalPageShell
      description="Paid promotions are one-time purchases. Users cannot issue their own refunds; refund decisions and Stripe instructions are handled only by an IWANNAPEE administrator."
      title="Refund Policy"
    >
      <LegalSection title="1. One-time advertising purchases">
        <p>IWANNAPEE business promotions are one-time purchases for the price, duration, and location radius shown before payment. They are not subscriptions and do not renew automatically.</p>
      </LegalSection>

      <LegalSection title="2. General no-refund rule">
        <p>Except for the limited circumstances below or where required by law, purchases are final after a campaign is activated. Stopping or deleting a campaign early does not provide a full or prorated refund.</p>
        <p>Refunds are not provided because a campaign receives fewer impressions, clicks, visits, promo-code uses, QR actions, sales, or other results than expected. An optional priority placement add-on improves relative ordering only and does not guarantee a sponsored slot or any performance outcome.</p>
        <p>We do not ordinarily refund unused campaign time when a campaign is stopped or removed because the advertiser supplied inaccurate information, the restroom is unavailable, promotion content violates our <Link href="/terms">Terms</Link>, or a linked offer or destination is unlawful, deceptive, unsafe, or inaccessible.</p>
      </LegalSection>

      <LegalSection title="3. Situations eligible for administrator review">
        <p>An IWANNAPEE administrator may approve a full or partial refund when appropriate, including for:</p>
        <ul>
          <li>a duplicate Stripe charge;</li>
          <li>an unauthorized payment supported by reasonable information;</li>
          <li>a verified IWANNAPEE technical failure that prevents the purchased campaign from being activated or materially delivered;</li>
          <li>an incorrect amount caused by an IWANNAPEE billing error; or</li>
          <li>a refund required by applicable law or payment-network rules.</li>
        </ul>
        <p>Submitting a request does not guarantee approval. Nothing in this policy limits non-waivable consumer rights or Stripe’s and card issuers’ authority to process disputes, reversals, or legally required refunds.</p>
      </LegalSection>

      <LegalSection title="4. Administrator-only processing">
        <p>Users cannot initiate a refund from their account. Only an authorized IWANNAPEE administrator may approve and submit a refund through Stripe. The Stop and Delete controls immediately affect campaign visibility but never initiate a refund.</p>
        <p>Approved refunds are returned to the original payment method through Stripe. Bank and card-network processing times vary. A refund will not exceed the amount actually paid after discounts or promotion codes.</p>
      </LegalSection>

      <LegalSection title="5. Optional platform-support amounts">
        <p>Optional platform support is not a charitable donation, is not represented as tax-deductible, and does not affect placement. It is generally final with the related purchase, except when included in an administrator-approved correction of a duplicate, unauthorized, failed, or legally refundable transaction.</p>
      </LegalSection>

      <LegalSection title="6. How to request review">
        <p>Email <a href={`mailto:${SUPPORT_EMAIL}?subject=Promotion%20refund%20review`}>{SUPPORT_EMAIL}</a> with the campaign name, business name, account email, transaction date, and a concise explanation. Never email a full card number, card security code, Stripe secret key, or magic sign-in link.</p>
        <p>For the fastest resolution, contact us before opening a payment dispute so we can investigate the campaign and Stripe record. Contacting us does not waive any rights you may have.</p>
      </LegalSection>
    </LegalPageShell>
  );
}
