import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/site";

export const LEGAL_EFFECTIVE_DATE = "August 22, 2026";
export { SUPPORT_EMAIL } from "@/lib/site";

const legalLinks = [
  { href: "/terms", label: "Terms" },
  { href: "/refund-policy", label: "Refund Policy" },
  { href: "/privacy", label: "Privacy" },
  { href: "/contact", label: "Contact" },
];

export function LegalPageShell({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <main className="legal-page">
      <header className="legal-site-header">
        <Link className="brand legal-brand" href="/" aria-label="IWANNAPEE home">
          <span className="brand-mark"><Image alt="" height={512} src="/brand/iwannapee-logo.webp" width={512} /></span>
          <span>IWANNAPEE</span>
        </Link>
        <Link className="button button-secondary" href="/"><ArrowLeft size={16} /> Back to map</Link>
      </header>

      <article className="legal-document">
        <header className="legal-document-heading">
          <p className="eyebrow">IWANNAPEE policies</p>
          <h1>{title}</h1>
          <p>{description}</p>
          <small>Effective and last updated {LEGAL_EFFECTIVE_DATE}</small>
        </header>
        <div className="legal-document-body">{children}</div>
      </article>

      <footer className="legal-footer">
        <nav aria-label="Legal pages">
          {legalLinks.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}
        </nav>
        <a href={`mailto:${SUPPORT_EMAIL}`}><Mail size={15} /> {SUPPORT_EMAIL}</a>
        <p>IWANNAPEE is operated by Loskutech LLC.</p>
      </footer>
    </main>
  );
}

export function LegalSection({ children, title }: { children: ReactNode; title: string }) {
  return <section><h2>{title}</h2>{children}</section>;
}
