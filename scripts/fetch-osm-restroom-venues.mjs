import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REGIONS = [
  { slug: "los-angeles", label: "Los Angeles", west: -118.9448, east: -117.6464, south: 33.7037, north: 34.3373 },
  { slug: "new-york-city", label: "New York City", west: -74.2591, east: -73.7002, south: 40.4774, north: 40.9176 },
];

function argumentValue(name, fallback = "") {
  const prefix = `${name}=`;
  const exactIndex = process.argv.indexOf(name);
  if (exactIndex >= 0) return process.argv[exactIndex + 1] || fallback;
  const inline = process.argv.find((entry) => entry.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

const outputPath = path.resolve(argumentValue("--output", ".data/osm-restroom-venues.geojson"));
const endpoint = argumentValue("--endpoint", process.env.OSM_OVERPASS_URL || "https://overpass-api.de/api/interpreter");

async function fetchRegion(region) {
  const bbox = `${region.south},${region.west},${region.north},${region.east}`;
  const query = `[out:json][timeout:180];(nwr["toilets"="yes"](${bbox});nwr["toilets:access"~"^(yes|customers)$"](${bbox}););out center tags;`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "IWANNAPEE restroom venue importer (+https://www.iwannapee.lol)",
    },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(210_000),
  });
  if (!response.ok) throw new Error(`${region.label} Overpass request failed with HTTP ${response.status}`);
  const payload = await response.json();
  const features = (payload.elements || []).flatMap((element) => {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{
      type: "Feature",
      geometry: { type: "Point", coordinates: [longitude, latitude] },
      properties: {
        id: element.id,
        type: element.type,
        tags: element.tags || {},
        iwannapee_region: region.slug,
      },
    }];
  });
  console.log(`${region.label}: fetched ${features.length} restroom-tagged venues.`);
  return features;
}

const deduplicated = new Map();
for (const region of REGIONS) {
  for (const feature of await fetchRegion(region)) {
    deduplicated.set(`${feature.properties.type}:${feature.properties.id}`, feature);
  }
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({ type: "FeatureCollection", features: [...deduplicated.values()] })}\n`, "utf8");
console.log(`Wrote ${deduplicated.size} unique venue features to ${outputPath}.`);
