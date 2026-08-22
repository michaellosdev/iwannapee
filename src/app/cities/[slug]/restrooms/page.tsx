import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { PublicRestroomCard } from "@/components/public-restroom-card";
import { DIRECTORY_CITIES, cityBySlug, getCityRestrooms } from "@/lib/public-directory";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return DIRECTORY_CITIES.map((city) => ({ slug: city.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const city = cityBySlug((await params).slug);
  if (!city) return {};
  return {
    title: `Public restrooms in ${city.name}`,
    description: city.description,
    alternates: { canonical: `/cities/${city.slug}/restrooms` },
    openGraph: { title: `Public restrooms in ${city.name} | IWANNAPEE`, description: city.description },
  };
}

export default async function CityRestroomPage({ params }: { params: Promise<{ slug: string }> }) {
  const city = cityBySlug((await params).slug);
  if (!city) notFound();
  const restrooms = await getCityRestrooms(city);
  return (
    <main className="directory-page">
      <header className="directory-hero directory-city-hero">
        <Link className="directory-brand" href="/">IWANNAPEE</Link>
        <p className="eyebrow"><MapPin size={15} /> {city.name}, {city.region}</p>
        <h1>Public restrooms in {city.name}</h1>
        <p>{city.description}</p>
        <div className="directory-hero-actions"><Link className="button button-primary" href="/">Open nearby map</Link><Link className="button button-secondary" href="/restrooms">All cities</Link></div>
      </header>
      <section className="directory-results">
        <div className="directory-section-heading"><div><p className="eyebrow">{restrooms.length} locations</p><h2>Restrooms in and around {city.name}</h2></div></div>
        <div className="directory-restroom-grid">{restrooms.map((restroom) => <PublicRestroomCard key={restroom.id} restroom={restroom} />)}</div>
        {restrooms.length === 0 ? <p className="directory-empty">No imported listings are available in this area yet. Check the live map or add a restroom for the community.</p> : null}
      </section>
    </main>
  );
}
