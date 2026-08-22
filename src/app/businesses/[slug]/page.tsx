/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, ExternalLink, Globe2, Mail, MapPin, Phone } from "lucide-react";
import { businessPath, idFromPublicSlug, restroomPath } from "@/lib/public-links";
import { getPublicBusiness, getPublicRestroom } from "@/lib/public-directory";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const id = idFromPublicSlug((await params).slug);
  const business = id ? await getPublicBusiness(id) : null;
  if (!business) return {};
  const description = business.description || `${business.business_name} is a verified IWANNAPEE business with a community restroom listing.`;
  return { title: business.business_name, description, alternates: { canonical: businessPath(business) }, openGraph: { title: `${business.business_name} | IWANNAPEE`, description, images: business.cover_image_url || business.profile_image_url ? [business.cover_image_url || business.profile_image_url || ""] : undefined } };
}

export default async function PublicBusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const id = idFromPublicSlug((await params).slug);
  if (!id) notFound();
  const business = await getPublicBusiness(id);
  if (!business) notFound();
  const restroom = await getPublicRestroom(business.restroom_id);
  if (!restroom) notFound();
  return (
    <main className="public-detail-page business-profile-public">
      <nav className="public-detail-nav"><Link className="directory-brand" href="/">IWANNAPEE</Link><div><Link href="/restrooms">Directory</Link><Link className="button button-primary" href={restroomPath(restroom)}>Restroom listing</Link></div></nav>
      {business.cover_image_url ? <div className="business-profile-cover"><img alt={`${business.business_name} cover`} src={business.cover_image_url} /></div> : null}
      <header className="business-profile-hero">
        {business.profile_image_url ? <div className="business-profile-avatar"><img alt={`${business.business_name} logo`} src={business.profile_image_url} /></div> : <div className="business-profile-avatar"><span>{business.business_name.charAt(0)}</span></div>}
        <div><span className="verification-status verified"><BadgeCheck size={16} /> Verified business</span><h1>{business.business_name}</h1><p>{business.description || "A verified IWANNAPEE restroom partner."}</p></div>
      </header>
      <section className="business-public-grid">
        <article><p className="eyebrow">Community restroom</p><h2>{restroom.name}</h2><p><MapPin size={16} /> {restroom.address}</p><Link className="button button-primary" href={restroomPath(restroom)}>View restroom details</Link></article>
        <article><p className="eyebrow">Connect</p><div className="business-contact-list">{business.website_url ? <a href={business.website_url} rel="noreferrer" target="_blank"><Globe2 size={17} /> Website <ExternalLink size={14} /></a> : null}{business.public_email ? <a href={`mailto:${business.public_email}`}><Mail size={17} /> {business.public_email}</a> : null}{business.phone ? <a href={`tel:${business.phone}`}><Phone size={17} /> {business.phone}</a> : null}</div></article>
      </section>
      {business.promotion_headline ? <section className="business-public-offer"><p className="eyebrow">Current community offer</p><h2>{business.promotion_headline}</h2>{business.promotion_offer_text ? <p>{business.promotion_offer_text}</p> : null}{business.promotion_code ? <strong>Code: {business.promotion_code}</strong> : null}</section> : null}
    </main>
  );
}
