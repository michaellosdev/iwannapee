import type { Metadata } from "next";
import Link from "next/link";
import { MapPinned } from "lucide-react";
import { PublicRestroomCard } from "@/components/public-restroom-card";
import { DIRECTORY_CITIES, getDirectoryRestrooms } from "@/lib/public-directory";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Public restroom directory",
  description: "Browse public restrooms with directions, access information, ratings, photos, and community verification.",
  alternates: { canonical: "/restrooms" },
};

export default async function RestroomDirectoryPage() {
  const restrooms = await getDirectoryRestrooms();
  return (
    <main className="directory-page">
      <header className="directory-hero">
        <Link className="directory-brand" href="/">IWANNAPEE</Link>
        <p className="eyebrow"><MapPinned size={15} /> Public restroom directory</p>
        <h1>A restroom directory that gets better when people use it.</h1>
        <p>Explore community-rated restrooms, check access details, and help verify that imported locations are still accurate.</p>
        <div className="directory-city-links">
          {DIRECTORY_CITIES.map((city) => <Link key={city.slug} href={`/cities/${city.slug}/restrooms`}>{city.name}</Link>)}
        </div>
      </header>
      <section className="directory-results" aria-label="Recently verified and highly rated restrooms">
        <div className="directory-section-heading"><div><p className="eyebrow">Explore listings</p><h2>Community restroom listings</h2></div><Link className="button button-primary" href="/">Find near me</Link></div>
        <div className="directory-restroom-grid">
          {restrooms.map((restroom) => <PublicRestroomCard key={restroom.id} restroom={restroom} />)}
        </div>
        {restrooms.length === 0 ? <p className="directory-empty">Listings are being prepared. Use the live map to find nearby restrooms now.</p> : null}
      </section>
    </main>
  );
}
