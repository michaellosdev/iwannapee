import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, LegalSection, SUPPORT_EMAIL } from "@/components/legal-page-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How IWANNAPEE collects, uses, shares, and protects account, location, community, analytics, and payment-related data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPageShell
      description="This policy explains how IWANNAPEE handles account, location, community, analytics, advertising, and payment-related information."
      title="Privacy Policy"
    >
      <LegalSection title="1. Scope and operator">
        <p>This Privacy Policy applies to IWANNAPEE, operated by Loskutech LLC. It covers our website, account features, restroom discovery tools, community contributions, business promotions, and related support.</p>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <ul>
          <li><strong>Account information:</strong> email address, account identifier, display name if provided, authentication events, and account role.</li>
          <li><strong>Location and search information:</strong> coordinates you enter, select on a map, or permit your device to provide; selected addresses; search areas; and nearby-results requests.</li>
          <li><strong>Community content:</strong> restroom submissions, corrections, verifications, ratings, reviews, notes, replies, reports, photos, captions, votes, and associated timestamps.</li>
          <li><strong>Business-promotion information:</strong> business and restroom details, campaign location and radius, promotion copy, offers, codes, links, campaign status, and privacy-conscious campaign activity totals.</li>
          <li><strong>Payment-related information:</strong> Stripe Checkout and PaymentIntent identifiers, transaction amount and currency, discounts, payment and refund status, and limited customer details made available by Stripe. We do not receive or store full card numbers or card security codes.</li>
          <li><strong>Technical and security information:</strong> IP-derived security signals, browser and device information, request timestamps, rate-limit records, CAPTCHA results, error reports, and service logs.</li>
          <li><strong>Analytics choices and events:</strong> consent selection, pathname-level visits, and limited interaction events configured not to include emails, access codes, promo codes, free-form review text, or exact location coordinates.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. How we use information">
        <p>We use information to authenticate users; return nearby restroom results; display and improve restroom records; operate community verification and moderation; create, rank, measure, and administer promotions; process payments and refunds; prevent abuse and fraud; diagnose errors; communicate about support or transactions; comply with law; and protect users, IWANNAPEE, and third parties.</p>
      </LegalSection>

      <LegalSection title="4. Location privacy">
        <p>Device location is requested only through browser permission controls. You can refuse permission and search or place a map pin manually. Coordinates are processed to return nearby results and location-eligible promotions. We do not intentionally send exact coordinates, searched addresses, or restroom access codes to Google Analytics.</p>
        <p>Location choices can still appear in necessary application requests, hosting logs, security systems, or records you intentionally submit. Avoid submitting private residential information unless it is necessary and appropriate for a genuinely public restroom listing.</p>
      </LegalSection>

      <LegalSection title="5. Public information">
        <p>Published restroom records, reviews, ratings, notes, replies, verification status, photos, captions, and business promotions can be visible to anyone. Your authentication email is not displayed publicly as part of ordinary community content. Do not include personal information in public text or images.</p>
      </LegalSection>

      <LegalSection title="6. Service providers and sharing">
        <p>We share information with service providers only as reasonably necessary for their work, including:</p>
        <ul>
          <li><strong>Supabase</strong> for authentication, database, and photo storage;</li>
          <li><strong>Stripe</strong> for Checkout, payment processing, refunds, fraud prevention, and disputes;</li>
          <li><strong>Vercel</strong> for hosting and application delivery;</li>
          <li><strong>Cloudflare Turnstile</strong> for abuse and automated-traffic prevention;</li>
          <li><strong>Google Analytics</strong> for limited site measurement under the consent choices described below;</li>
          <li><strong>Sentry</strong> for privacy-filtered error monitoring;</li>
          <li><strong>mapping, geocoding, and restroom-data providers</strong> when needed to find addresses, render maps, or supplement restroom results; and</li>
          <li>professional advisers, authorities, or transaction parties when required by law, necessary to protect rights and safety, or connected to a legitimate business reorganization.</li>
        </ul>
        <p>We do not sell personal information for money. Some privacy laws may treat optional analytics or advertising technology as “sharing.” You can keep optional analytics and advertising storage disabled or change your selection through the Privacy settings control in the site footer.</p>
      </LegalSection>

      <LegalSection title="7. Cookies, local storage, and analytics consent">
        <p>Necessary storage supports security, authentication, and essential application behavior. Google consent defaults to denied for analytics storage, ad storage, ad user data, and ad personalization. Limited cookieless measurement may occur while consent remains denied. If you select Accept all, those Google consent categories are granted until you change the selection or clear browser storage.</p>
      </LegalSection>

      <LegalSection title="8. Retention">
        <p>We retain information for as long as reasonably necessary to operate the service, maintain restroom history and community integrity, administer payments and disputes, prevent abuse, meet legal and accounting obligations, and preserve backups. Retention periods vary by data type. Public contributions may remain after an account is closed when continued retention is lawful and important to the integrity of the community record.</p>
      </LegalSection>

      <LegalSection title="9. Security">
        <p>We use administrative and technical safeguards designed to protect information, including server-side payment operations, signed webhooks, access controls, CAPTCHA, rate limits, and HTTPS. No online service can guarantee absolute security. Never send payment-card details, passwords, secret API keys, or magic sign-in links by email or in community content.</p>
      </LegalSection>

      <LegalSection title="10. Your choices and privacy rights">
        <p>You may deny device-location access, use manual search, control optional analytics through Privacy settings, edit or remove certain account information, and request access, correction, or deletion where applicable. Legal rights vary by location and may be subject to identity verification and lawful retention exceptions.</p>
        <p>To make a privacy request, email <a href={`mailto:${SUPPORT_EMAIL}?subject=Privacy%20request`}>{SUPPORT_EMAIL}</a>. Include enough information to locate your account, but do not send sensitive credentials or full payment-card information.</p>
      </LegalSection>

      <LegalSection title="11. Children and international processing">
        <p>IWANNAPEE is not directed to children under 13, and we do not knowingly collect personal information from children under 13. Service providers may process information in the United States and other countries where they operate, subject to their safeguards and applicable law.</p>
      </LegalSection>

      <LegalSection title="12. Changes and contact">
        <p>We may update this policy as the service and legal requirements change. The effective date above identifies the current version. Questions or requests can be sent to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. For payment-specific terms, see the <Link href="/refund-policy">Refund Policy</Link>.</p>
      </LegalSection>
    </LegalPageShell>
  );
}
