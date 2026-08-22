import type { Metadata } from "next";
import { Mail, MessageSquareWarning, ReceiptText, ShieldCheck } from "lucide-react";
import { LegalPageShell, LegalSection, SUPPORT_EMAIL } from "@/components/legal-page-shell";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact IWANNAPEE for account, restroom, privacy, moderation, promotion, and payment support.",
  alternates: { canonical: "/contact" },
};

const topics = [
  { icon: ReceiptText, title: "Promotion and payment support", copy: "Include the business name, campaign name, account email, and transaction date." },
  { icon: MessageSquareWarning, title: "Restroom or community report", copy: "Include the restroom name or map location and a concise explanation." },
  { icon: ShieldCheck, title: "Privacy or security", copy: "Use the subject “Privacy request” or “Security report” so we can route it appropriately." },
];

export default function ContactPage() {
  return (
    <LegalPageShell
      description="Contact IWANNAPEE about accounts, restroom information, community moderation, business promotions, privacy, or payments."
      title="Contact IWANNAPEE"
    >
      <section className="legal-contact-hero">
        <span><Mail size={24} /></span>
        <div>
          <h2>Email support</h2>
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          <p>IWANNAPEE is operated by Loskutech LLC in California.</p>
        </div>
      </section>

      <LegalSection title="What to include">
        <div className="legal-contact-grid">
          {topics.map(({ copy, icon: Icon, title }) => (
            <article key={title}><Icon size={20} /><h3>{title}</h3><p>{copy}</p></article>
          ))}
        </div>
      </LegalSection>

      <LegalSection title="Keep sensitive information out of email">
        <p>Never send a full payment-card number, card security code, Stripe secret key, Supabase secret, password, or magic sign-in link. IWANNAPEE support does not need those values to investigate an account, campaign, or payment.</p>
      </LegalSection>
    </LegalPageShell>
  );
}
