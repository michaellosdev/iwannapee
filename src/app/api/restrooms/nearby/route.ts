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

function featuresFromTags(tags: Record<string, string>, access: string | undefined): RestroomFeature[] {
  const features: RestroomFeature[] = [];
  if (yes(tags.wheelchair) || yes(tags["toilets:wheelchair"])) features.push("Accessible");
  if (yes(tags.baby_changing) || yes(tags.changing_table)) features.push("Baby changing");
  if (yes(tags.unisex) || tags.gender_segregated === "no") features.push("Gender neutral");
  if (tags.fee !== "yes" && access !== "customers") features.push("Free");
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

  const providerUrl = process.env.RESTROOM_DATA_API_URL
    || (process.env.NODE_ENV === "development" ? "https://overpass-api.de/api/interpreter" : "");
  if (!providerUrl) return NextResponse.json([]);

  const query = `[out:json][timeout:18];(nwr["amenity"="toilets"](around:${Math.round(radius)},${latitude},${longitude});nwr["toilets"="yes"](around:${Math.round(radius)},${latitude},${longitude});nwr["toilets:access"~"^(yes|customers)$"](around:${Math.round(radius)},${latitude},${longitude}););out center tags;`;
  const endpoint = new URL(providerUrl);
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
      const standalone = tags.amenity === "toilets";
      const restroomAccess = tags["toilets:access"] || tags.access;
      if (["private", "no", "permit"].includes(restroomAccess)) return [];
      const venueName = tags.name || tags.operator;
      const name = standalone
        ? venueName || "Public Restroom"
        : venueName ? `${venueName} Restroom` : "Restroom inside this venue";

      return [{
        id: `osm-${element.type}-${element.id}`,
        name,
        address: addressFromTags(tags),
        description: tags.description || (standalone
          ? "Public restroom listed by OpenStreetMap contributors. Add a community verification to share more detail."
          : "A restroom is reported inside this venue by OpenStreetMap contributors. Community verification is still needed."),
        directions: directionsFromTags(tags),
        hours: tags.opening_hours || "Hours not listed",
        openNow: null,
        accessCode: null,
        accessInstructions: restroomAccess === "customers" ? "Reported as customer-only access; confirm before relying on it." : "No access instructions have been added yet.",
        coverPhotoUrl: tags.image?.startsWith("http") ? tags.image : null,
        rating: 0,
        cleanlinessRating: 0,
        reviewCount: 0,
        distanceMeters: distanceInMeters(
          { latitude, longitude },
          { latitude: elementLatitude, longitude: elementLongitude },
        ),
        features: featuresFromTags(tags, restroomAccess),
        lastVerifiedAt: new Date(0).toISOString(),
        communityVerifiedAt: null,
        communityVerificationCount: 0,
        communityNotFoundCount: 0,
        latitude: elementLatitude,
        longitude: elementLongitude,
        source: "openstreetmap",
        sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      }];
    });

    return NextResponse.json(restrooms.sort((first, second) => first.distanceMeters - second.distanceMeters).slice(0, 100));
  } catch {
    return NextResponse.json({ error: "Nearby restroom discovery is temporarily unavailable." }, { status: 502 });
  }
}
