/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Accessibility, BadgeCheck, Building2, Clock3, ExternalLink, KeyRound, MapPin, Navigation, ShieldCheck, Star } from "lucide-react";
import { RestroomShareTools } from "@/components/restroom-share-tools";
import { businessPath, idFromPublicSlug, restroomPath } from "@/lib/public-links";
import { getBusinessForRestroom, getPublicReviews, getRestroomListing } from "@/lib/public-directory";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function verifiedLabel(value: string | null) {
  if (!value) return "Not yet verified by the community";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return "Verified today";
  if (days === 1) return "Verified 1 day ago";
  return `Verified ${days.toLocaleString()} days ago`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const id = idFromPublicSlug((await params).slug);
  const restroom = id ? await getRestroomListing(id) : null;
  if (!restroom) return {};
  const path = restroomPath(restroom);
  const description = `${restroom.name} at ${restroom.address}. See hours, directions, accessibility, ratings, access details, and community verification.`;
  return {
    title: `${restroom.name} restroom`,
    description,
    robots: restroom.status === "published" ? undefined : { index: false, follow: false },
    alternates: { canonical: path },
    openGraph: { title: `${restroom.name} restroom | ${SITE_NAME}`, description, url: path, images: restroom.cover_photo_url ? [restroom.cover_photo_url] : undefined },
    twitter: { card: restroom.cover_photo_url ? "summary_large_image" : "summary", title: `${restroom.name} restroom`, description },
  };
}

export default async function PublicRestroomPage({ params }: { params: Promise<{ slug: string }> }) {
  const id = idFromPublicSlug((await params).slug);
  if (!id) notFound();
  const supabase = await createClient();
  const { data: authData } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null } };
  const [restroom, business, reviews] = await Promise.all([
    getRestroomListing(id, authData.user?.id),
    getBusinessForRestroom(id),
    getPublicReviews(id),
  ]);
  if (!restroom) notFound();
  const path = restroomPath(restroom);
  const canonicalUrl = `${SITE_URL}${path}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${restroom.latitude},${restroom.longitude}`;
  const verified = Boolean(restroom.community_verified_at && restroom.community_verification_count > restroom.community_not_found_count);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: `${restroom.name} restroom`,
    description: restroom.description || SITE_DESCRIPTION,
    url: canonicalUrl,
    image: restroom.cover_photo_url || undefined,
    address: restroom.address,
    geo: { "@type": "GeoCoordinates", latitude: restroom.latitude, longitude: restroom.longitude },
    aggregateRating: restroom.review_count > 0 ? { "@type": "AggregateRating", ratingValue: restroom.rating, reviewCount: restroom.review_count, bestRating: 5 } : undefined,
    publicAccess: true,
  };

  return (
    <main className="public-detail-page">
      <script dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} type="application/ld+json" />
      <nav className="public-detail-nav"><Link className="directory-brand" href="/">IWANNAPEE</Link><div><Link href="/restrooms">Directory</Link><Link className="button button-primary" href="/">Find near me</Link></div></nav>
      <article className="public-restroom-detail">
        {restroom.cover_photo_url ? <div className="public-restroom-cover"><img alt={`Restroom at ${restroom.name}`} src={restroom.cover_photo_url} /></div> : null}
        <div className="public-restroom-main">
          <div className="public-restroom-heading">
            <div>
              <span className={verified ? "verification-status verified" : "verification-status"}>{verified ? <BadgeCheck size={16} /> : <ShieldCheck size={16} />}{verifiedLabel(restroom.community_verified_at)}</span>
              <h1>{restroom.name}</h1>
              <p><MapPin size={17} /> {restroom.address}</p>
            </div>
            {restroom.review_count > 0 ? <div className="public-rating"><strong>{restroom.rating.toFixed(1)}</strong><span><Star size={15} fill="currentColor" /> {restroom.review_count} reviews</span></div> : <div className="public-rating unrated"><strong>New</strong><span>Be first to rate</span></div>}
          </div>
          <div className="public-detail-actions">
            <a className="button button-primary" href={directionsUrl} rel="noreferrer" target="_blank"><Navigation size={17} /> Directions</a>
            <Link className="button button-secondary" href={`/?lat=${restroom.latitude}&lng=${restroom.longitude}&restroom=${restroom.id}`}><MapPin size={17} /> Open on map</Link>
          </div>
          <section className="public-detail-facts">
            <div><Clock3 size={20} /><span><small>Hours</small><strong>{restroom.hours || "Not listed"}</strong></span></div>
            <div><KeyRound size={20} /><span><small>Access code</small><strong>{restroom.access_code || "No code listed"}</strong></span></div>
            <div><Star size={20} /><span><small>Cleanliness</small><strong>{restroom.review_count ? `${restroom.cleanliness_rating.toFixed(1)} / 5` : "Not rated"}</strong></span></div>
          </section>
          {restroom.access_instructions ? <section className="public-copy-section"><h2>Access information</h2><p>{restroom.access_instructions}</p></section> : null}
          {restroom.description ? <section className="public-copy-section"><h2>What to expect</h2><p>{restroom.description}</p></section> : null}
          {restroom.features.length > 0 ? <section className="public-copy-section"><h2>Features</h2><div className="public-feature-list">{restroom.features.map((feature) => <span key={feature}>{feature.toLowerCase().includes("access") ? <Accessibility size={15} /> : <BadgeCheck size={15} />}{feature}</span>)}</div></section> : null}
          {restroom.directions ? <section className="public-copy-section"><h2>How to find it</h2><p>{restroom.directions}</p></section> : null}
        </div>
      </article>

      {business ? (
        <section className="claimed-business-card">
          {business.profile_image_url ? <div><img alt={`${business.business_name} logo`} src={business.profile_image_url} /></div> : <div><Building2 size={28} /></div>}
          <span><small>Verified business profile</small><strong>{business.business_name}</strong><p>{business.description || "This business has claimed and verified its restroom listing."}</p></span>
          <Link className="button button-secondary" href={businessPath(business)}>View business <ExternalLink size={16} /></Link>
        </section>
      ) : restroom.status === "published" ? (
        <section className="claim-business-card">
          <div><p className="eyebrow">Own or manage this location?</p><h2>Claim this restroom listing for free.</h2><p>After owner verification, manage your business profile, download a Community Verified QR badge, and receive one complimentary 7-day launch placement.</p></div>
          <Link className="button button-primary" href={`/business/claim/${restroom.id}`}>Claim my business</Link>
        </section>
      ) : null}

      <RestroomShareTools address={restroom.address} canonicalUrl={canonicalUrl} name={restroom.name} verifiedAt={verified ? restroom.community_verified_at : null} />

      <section className="public-review-section">
        <div><p className="eyebrow">Community reviews</p><h2>What visitors say</h2></div>
        {reviews.length > 0 ? <div className="public-review-grid">{reviews.map((review) => <article key={review.id}><span><Star size={15} fill="currentColor" /> {review.overall_rating}/5 · Cleanliness {review.cleanliness_rating}/5</span><p>{review.note || "Rating submitted without a written review."}</p><small>{new Date(review.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</small></article>)}</div> : <p className="directory-empty">No reviews yet. Open this restroom on the map to add the first rating.</p>}
      </section>
    </main>
  );
}
