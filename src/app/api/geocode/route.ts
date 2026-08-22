import { NextResponse } from "next/server";
import { captchaRequiredResponse, hasCaptchaSession } from "@/lib/security/captcha";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

type PhotonFeature = {
  geometry?: {
    coordinates?: [number, number];
    type?: string;
  };
  properties?: {
    city?: string;
    country?: string;
    district?: string;
    formatted?: string;
    housenumber?: string;
    name?: string;
    postcode?: string;
    state?: string;
    street?: string;
  };
};

type PhotonResponse = { features?: PhotonFeature[] };

function resultLabel(properties: NonNullable<PhotonFeature["properties"]>) {
  if (properties.formatted) return properties.formatted;
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
  const limit = await consumeRateLimit(request, {
    bucket: "geocode",
    limit: 60,
    windowSeconds: 60,
  });
  const limited = rateLimitResponse(limit);
  if (limited) return limited;
  if (limit && limit.count > 15 && !hasCaptchaSession(request)) return captchaRequiredResponse();

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
  const geoapifyKey = process.env.GEOAPIFY_API_KEY;
  const geocoderBaseUrl = process.env.GEOCODER_BASE_URL
    || (geoapifyKey ? "https://api.geoapify.com" : "")
    || (process.env.NODE_ENV === "development" ? "https://photon.komoot.io" : "");
  if (!geocoderBaseUrl) return NextResponse.json({ error: "A production geocoding provider is not configured." }, { status: 503 });

  try {
    const usesGeoapify = new URL(geocoderBaseUrl).hostname.endsWith("geoapify.com");
    const endpoint = new URL(usesGeoapify ? "/v1/geocode/autocomplete" : "/api", geocoderBaseUrl);
    endpoint.searchParams.set(usesGeoapify ? "text" : "q", query);
    endpoint.searchParams.set("limit", "6");
    if (usesGeoapify && geoapifyKey) {
      endpoint.searchParams.set("format", "geojson");
      endpoint.searchParams.set("apiKey", geoapifyKey);
    }
    if (hasLocationBias) {
      if (usesGeoapify) endpoint.searchParams.set("bias", `proximity:${longitude},${latitude}`);
      else {
        endpoint.searchParams.set("lat", String(latitude));
        endpoint.searchParams.set("lon", String(longitude));
        endpoint.searchParams.set("location_bias_scale", "0.25");
      }
    }

    const response = await fetch(endpoint, {
      headers: { "User-Agent": "IWANNAPEE/0.1 (+https://www.iwannapee.lol)" },
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
