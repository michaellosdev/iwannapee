import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, LegalSection, SUPPORT_EMAIL } from "@/components/legal-page-shell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing use of IWANNAPEE restroom discovery, community, and sponsored promotion services.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPageShell
      description="These terms govern restroom discovery, community contributions, accounts, and paid business promotions on IWANNAPEE."
      title="Terms of Service"
    >
      <LegalSection title="1. Who we are and acceptance">
        <p>IWANNAPEE is a restroom discovery, community information, and local advertising service operated by Loskutech LLC (“IWANNAPEE,” “we,” “us,” or “our”). By accessing or using the service, creating an account, contributing content, or purchasing a promotion, you agree to these Terms and our <Link href="/privacy">Privacy Policy</Link>. Paid promotions are also governed by our <Link href="/refund-policy">Refund Policy</Link>.</p>
        <p>If you do not agree, do not use the service. You must be legally capable of entering into these Terms. You must be at least 18 years old to purchase a business promotion or act for a business.</p>
      </LegalSection>

      <LegalSection title="2. Restroom information is community information">
        <p>IWANNAPEE combines imported, business-submitted, and community-contributed information. Hours, access requirements, codes, directions, accessibility features, cleanliness, photos, and even the continued existence of a restroom can change without notice.</p>
        <p>We do not guarantee that a restroom is open, available, safe, clean, accessible, free, or suitable for a particular person. Check posted rules and obtain permission when required. IWANNAPEE is not an emergency service and should not be relied on when urgent medical or safety assistance is needed.</p>
      </LegalSection>

      <LegalSection title="3. Accounts and magic links">
        <p>You are responsible for using an email address you control and for safeguarding access to that email account. Magic links are personal to the recipient and must not be shared. You are responsible for activity performed through your authenticated account.</p>
      </LegalSection>

      <LegalSection title="4. Community contributions">
        <p>You may submit restrooms, corrections, verifications, reviews, ratings, notes, replies, and photos. You must submit information you reasonably believe is accurate and content you have the right to share. Do not submit private personal information, payment details, unlawful content, harassment, impersonation, misleading claims, or images that violate another person’s privacy or intellectual-property rights.</p>
        <p>You retain ownership of content you create. You grant IWANNAPEE a worldwide, non-exclusive, royalty-free, sublicensable license to host, store, reproduce, adapt for display and accessibility, publish, and distribute that content for operating, promoting, and improving the service. This license continues for content already distributed or reasonably retained for security, moderation, legal, and backup purposes.</p>
        <p>Community content may be reviewed before or after publication. We may reject, hide, edit for formatting, or remove content, accounts, or access when we reasonably believe it is inaccurate, unsafe, unlawful, abusive, fraudulent, or inconsistent with these Terms.</p>
      </LegalSection>

      <LegalSection title="5. Sponsored promotions">
        <p>A business promotion is a one-time purchase for the duration, radius, and price shown before Checkout. The current base offer is displayed in US dollars and is not a subscription. The campaign begins only after Stripe confirms payment and IWANNAPEE activates the campaign.</p>
        <p>The purchaser represents that they are authorized to promote the named business and that the promoted restroom is genuinely available during the stated hours. Promotion copy, offers, promo codes, QR destinations, and linked websites must be accurate, lawful, safe, and not deceptive. A promotion may not advertise or facilitate goods, services, or conduct prohibited by law, Stripe’s rules, or our moderation standards.</p>
        <p>Sponsored eligibility depends on the selected radius, the visitor’s search area, campaign dates, and competing eligible campaigns. An optional priority placement add-on can improve relative ordering, but it does not guarantee a sponsored slot, minimum impressions, clicks, visits, redemptions, revenue, or any other result. Distance and other eligibility rules can affect placement.</p>
        <p>We may pause, reject, or remove a campaign that is inaccurate, unavailable, unlawful, harmful, technically unsafe, or inconsistent with these Terms. Stopping or deleting a campaign early does not itself create a right to a refund. See the <Link href="/refund-policy">Refund Policy</Link> for the complete rules.</p>
      </LegalSection>

      <LegalSection title="6. Payments and optional platform support">
        <p>Stripe processes payments for IWANNAPEE. We do not receive or store full card numbers or card security codes. You authorize the amount and currency displayed in Stripe Checkout, including the base promotion, any priority placement add-on, and any optional platform-support amount you select.</p>
        <p>Optional platform support helps operate and improve IWANNAPEE. It is not a charitable donation, is not represented as tax-deductible, and does not improve campaign placement or purchase additional advertising performance.</p>
      </LegalSection>

      <LegalSection title="7. Prohibited use">
        <p>You may not scrape or overload the service; bypass security or rate limits; submit malware or unsafe links; manipulate reviews, votes, rankings, or analytics; use the service for fraud; impersonate another person or business; resell access without permission; or use IWANNAPEE to violate law or another person’s rights.</p>
      </LegalSection>

      <LegalSection title="8. Intellectual property">
        <p>Except for community content and third-party data identified with its own attribution, the IWANNAPEE service, branding, software, design, and original content belong to Loskutech LLC or its licensors. These Terms do not transfer ownership to you.</p>
      </LegalSection>

      <LegalSection title="9. Availability and disclaimers">
        <p>THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. We do not promise uninterrupted operation, complete data, a particular ranking, or a specific advertising outcome.</p>
        <p>Some jurisdictions do not allow particular warranty exclusions, so portions of this section may not apply to you.</p>
      </LegalSection>

      <LegalSection title="10. Limitation of liability">
        <p>To the maximum extent permitted by law, IWANNAPEE and Loskutech LLC will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, lost profits, lost data, business interruption, or harm arising from reliance on restroom information or third-party locations.</p>
        <p>For a paid promotion, our aggregate liability relating to that promotion will not exceed the amount actually paid to IWANNAPEE for it. This limitation does not apply where liability cannot legally be limited.</p>
      </LegalSection>

      <LegalSection title="11. Suspension and termination">
        <p>You may stop using IWANNAPEE at any time. We may suspend or terminate access, remove content, or stop a campaign when reasonably necessary to protect users, third parties, the service, or legal and payment-network compliance. Provisions that by their nature should survive termination—including ownership, licenses, disclaimers, liability limits, and payment obligations—will survive.</p>
      </LegalSection>

      <LegalSection title="12. Governing law and changes">
        <p>These Terms are governed by the laws of the State of California, without regard to conflict-of-law rules. Subject to any rights that cannot be waived, disputes will be brought in the state or federal courts serving Los Angeles County, California.</p>
        <p>We may update these Terms as the service changes. The effective date above identifies the current version. Material changes will be presented through the service or another reasonable notice method when required.</p>
      </LegalSection>

      <LegalSection title="13. Contact">
        <p>Questions about these Terms can be sent to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
      </LegalSection>
    </LegalPageShell>
  );
}
