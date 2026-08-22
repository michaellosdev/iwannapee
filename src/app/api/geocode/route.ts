import { NextResponse } from "next/server";

type PhotonFeature = {
  geometry?: {
    coordinates?: [number, number];
    type?: string;
  };
  properties?: {
    city?: string;
    country?: string;
    district?: string;
    housenumber?: string;
    name?: string;
    postcode?: string;
    state?: string;
    street?: string;
  };
};

type PhotonResponse = { features?: PhotonFeature[] };

function resultLabel(properties: NonNullable<PhotonFeature["properties"]>) {
  const streetAddress = [properties.housenumber, properties.street].filter(Boolean).join(" ");
  const parts = [
    streetAddress || properties.name,
    properties.city || properties.district,
    properties.state,
    properties.postcode,
    properties.country,
  ].filter((part, index, values): part is string => Boolean(part) && values.indexOf(part) === index);
  return parts.join(", ");
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const query = requestUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 3) return NextResponse.json({ error: "Enter at least three characters." }, { status: 400 });

  const latitude = Number(requestUrl.searchParams.get("lat"));
  const longitude = Number(requestUrl.searchParams.get("lng"));
  const hasLocationBias = Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180;

  try {
    const endpoint = new URL("/api", process.env.GEOCODER_BASE_URL || "https://photon.komoot.io");
    endpoint.searchParams.set("q", query);
    endpoint.searchParams.set("limit", "6");
    if (hasLocationBias) {
      endpoint.searchParams.set("lat", String(latitude));
      endpoint.searchParams.set("lon", String(longitude));
      endpoint.searchParams.set("location_bias_scale", "0.25");
    }

    const response = await fetch(endpoint, {
      headers: { "User-Agent": "Right2Pee/0.1 (+https://iwannapee.lol)" },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Geocoding provider unavailable");

    const payload = (await response.json()) as PhotonResponse;
    const seenLabels = new Set<string>();
    const results = (payload.features || []).flatMap((feature) => {
      const [longitudeResult, latitudeResult] = feature.geometry?.coordinates || [];
      const properties = feature.properties;
      if (!properties || !Number.isFinite(latitudeResult) || !Number.isFinite(longitudeResult)) return [];
      const label = resultLabel(properties);
      const labelKey = label.toLocaleLowerCase();
      if (!label || seenLabels.has(labelKey)) return [];
      seenLabels.add(labelKey);
      return [{ label, latitude: latitudeResult, longitude: longitudeResult }];
    });

    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "Location search is temporarily unavailable." }, { status: 502 });
  }
}
