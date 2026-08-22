import { NextResponse } from "next/server";
import { distanceInMeters } from "@/lib/distance";
import type { Restroom, RestroomFeature } from "@/types/restroom";

type OsmElement = {
  id: number;
  type: "node" | "way" | "relation";
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = { elements?: OsmElement[] };

const yes = (value: string | undefined) => value === "yes" || value === "designated";

function featuresFromTags(tags: Record<string, string>): RestroomFeature[] {
  const features: RestroomFeature[] = [];
  if (yes(tags.wheelchair)) features.push("Accessible");
  if (yes(tags.baby_changing) || yes(tags.changing_table)) features.push("Baby changing");
  if (yes(tags.unisex) || tags.gender_segregated === "no") features.push("Gender neutral");
  if (tags.fee !== "yes") features.push("Free");
  return features;
}

function addressFromTags(tags: Record<string, string>) {
  if (tags["addr:full"]) return tags["addr:full"];
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const locality = [tags["addr:city"], tags["addr:state"]].filter(Boolean).join(", ");
  if (street || locality) return [street, locality].filter(Boolean).join(", ");
  if (tags.operator) return `Operated by ${tags.operator}`;
  return "Location shown on map";
}

function directionsFromTags(tags: Record<string, string>) {
  if (tags.description) return tags.description;
  if (tags.level) return `Look for restroom signs on level ${tags.level}.`;
  if (tags.indoor === "yes") return "Located inside the building; follow posted restroom signs.";
  return "Use the map pin and look for public restroom signage.";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const latitude = Number(url.searchParams.get("lat"));
  const longitude = Number(url.searchParams.get("lng"));
  const requestedRadius = Number(url.searchParams.get("radius") || 8000);
  const radius = Math.max(500, Math.min(Number.isFinite(requestedRadius) ? requestedRadius : 8000, 12000));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: "Valid latitude and longitude are required." }, { status: 400 });
  }

  const query = `[out:json][timeout:18];nwr["amenity"="toilets"](around:${Math.round(radius)},${latitude},${longitude});out center tags;`;
  const endpoint = new URL("https://overpass-api.de/api/interpreter");
  endpoint.searchParams.set("data", query);

  try {
    const response = await fetch(endpoint, {
      headers: { "User-Agent": "IWANNAPEE/0.1 (+https://www.iwannapee.lol)" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error("OpenStreetMap restroom search failed");

    const payload = (await response.json()) as OverpassResponse;
    const restrooms = (payload.elements || []).flatMap((element): Restroom[] => {
      const elementLatitude = element.lat ?? element.center?.lat;
      const elementLongitude = element.lon ?? element.center?.lon;
      if (elementLatitude === undefined || elementLongitude === undefined) return [];

      const tags = element.tags || {};
      if (["private", "no", "customers"].includes(tags.access)) return [];
      const name = tags.name || (tags.operator ? `${tags.operator} Restroom` : "Public Restroom");

      return [{
        id: `osm-${element.type}-${element.id}`,
        name,
        address: addressFromTags(tags),
        description: tags.description || "Public restroom listed by OpenStreetMap contributors. Add a community update to share more detail.",
        directions: directionsFromTags(tags),
        hours: tags.opening_hours || "Hours not listed",
        openNow: null,
        accessCode: null,
        accessInstructions: tags.access === "customers" ? "Reported as customer access; confirm before relying on it." : "No access instructions have been added yet.",
        coverPhotoUrl: tags.image?.startsWith("http") ? tags.image : null,
        rating: 0,
        cleanlinessRating: 0,
        reviewCount: 0,
        distanceMeters: distanceInMeters(
          { latitude, longitude },
          { latitude: elementLatitude, longitude: elementLongitude },
        ),
        features: featuresFromTags(tags),
        lastVerifiedAt: new Date(0).toISOString(),
        latitude: elementLatitude,
        longitude: elementLongitude,
        source: "openstreetmap",
      }];
    });

    return NextResponse.json(restrooms.sort((first, second) => first.distanceMeters - second.distanceMeters).slice(0, 100));
  } catch {
    return NextResponse.json({ error: "Nearby restroom discovery is temporarily unavailable." }, { status: 502 });
  }
}
