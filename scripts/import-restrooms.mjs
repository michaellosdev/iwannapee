import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const PRIMARY_REGIONS = [
  { slug: "los-angeles", label: "Los Angeles", west: -118.9448, east: -117.6464, south: 33.7037, north: 34.3373, refugeQuery: "Los Angeles", country: "US" },
  { slug: "new-york-city", label: "New York City", west: -74.2591, east: -73.7002, south: 40.4774, north: 40.9176, refugeQuery: "New York", country: "US" },
];

const PRIORITY_REGIONS = [
  ...PRIMARY_REGIONS,
  { slug: "san-francisco-bay", label: "San Francisco Bay Area", west: -122.75, east: -121.75, south: 37.1, north: 38.1 },
  { slug: "san-diego", label: "San Diego", west: -117.35, east: -116.9, south: 32.5, north: 33.1 },
  { slug: "chicago", label: "Chicago", west: -88.3, east: -87.3, south: 41.5, north: 42.3 },
  { slug: "boston", label: "Boston", west: -71.3, east: -70.8, south: 42.1, north: 42.6 },
  { slug: "washington-dc", label: "Washington, DC", west: -77.3, east: -76.7, south: 38.7, north: 39.1 },
  { slug: "seattle", label: "Seattle", west: -122.5, east: -122.1, south: 47.4, north: 47.8 },
  { slug: "portland", label: "Portland", west: -122.85, east: -122.45, south: 45.35, north: 45.7 },
  { slug: "austin", label: "Austin", west: -98.0, east: -97.45, south: 30.05, north: 30.55 },
  { slug: "dallas-fort-worth", label: "Dallas–Fort Worth", west: -97.55, east: -96.45, south: 32.45, north: 33.25 },
  { slug: "houston", label: "Houston", west: -95.85, east: -94.95, south: 29.45, north: 30.2 },
  { slug: "miami", label: "Miami–Fort Lauderdale", west: -80.5, east: -80.05, south: 25.45, north: 26.35 },
  { slug: "philadelphia", label: "Philadelphia", west: -75.5, east: -74.85, south: 39.7, north: 40.25 },
  { slug: "phoenix", label: "Phoenix", west: -112.5, east: -111.55, south: 33.15, north: 33.85 },
  { slug: "denver", label: "Denver", west: -105.35, east: -104.55, south: 39.45, north: 40.05 },
  { slug: "atlanta", label: "Atlanta", west: -84.75, east: -83.95, south: 33.45, north: 34.15 },
  { slug: "las-vegas", label: "Las Vegas", west: -115.45, east: -114.9, south: 35.85, north: 36.4 },
  { slug: "london", label: "London", west: -0.55, east: 0.3, south: 51.28, north: 51.7 },
  { slug: "paris", label: "Paris", west: 2.1, east: 2.55, south: 48.75, north: 49.0 },
  { slug: "berlin", label: "Berlin", west: 13.1, east: 13.8, south: 52.3, north: 52.7 },
  { slug: "amsterdam", label: "Amsterdam", west: 4.72, east: 5.05, south: 52.25, north: 52.45 },
  { slug: "toronto", label: "Toronto", west: -79.64, east: -79.1, south: 43.55, north: 43.9 },
  { slug: "vancouver", label: "Vancouver", west: -123.35, east: -122.9, south: 49.1, north: 49.4 },
  { slug: "mexico-city", label: "Mexico City", west: -99.4, east: -98.9, south: 19.15, north: 19.6 },
  { slug: "tokyo", label: "Tokyo", west: 139.45, east: 140.0, south: 35.5, north: 35.9 },
  { slug: "sydney", label: "Sydney", west: 150.85, east: 151.35, south: -34.1, north: -33.65 },
  { slug: "melbourne", label: "Melbourne", west: 144.7, east: 145.25, south: -38.1, north: -37.55 },
];

const args = new Set(process.argv.slice(2));
const argumentValue = (name, fallback = "") => {
  const prefix = `${name}=`;
  const exactIndex = process.argv.indexOf(name);
  if (exactIndex >= 0) return process.argv[exactIndex + 1] || fallback;
  const inline = process.argv.find((entry) => entry.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
};

const geojsonPath = argumentValue("--geojson", process.env.RESTROOM_GEOJSON_PATH || "");
const scope = argumentValue("--scope", "la-ny");
const dryRun = args.has("--dry-run");
const includeRefuge = !args.has("--no-refuge");
const useReverseGeocoding = !args.has("--no-reverse-geocode") && Boolean(process.env.GEOAPIFY_API_KEY);
const resolvedOnly = args.has("--resolved-only");
const cachePath = path.resolve(argumentValue("--geocode-cache", ".data/restroom-geocode-cache.json"));

if (!geojsonPath) throw new Error("Pass --geojson /absolute/path/to/toilets.geojson or set RESTROOM_GEOJSON_PATH.");
if (!new Set(["la-ny", "priority", "all"]).has(scope)) throw new Error("--scope must be la-ny, priority, or all.");
if (scope === "all" && !args.has("--confirm-all")) throw new Error("The all-world import requires --confirm-all because it can consume substantial database space.");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecret = process.env.SUPABASE_SECRET_KEY;
if (!dryRun && (!supabaseUrl || !supabaseSecret)) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required for a database import.");

const trim = (value, max) => String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
const yes = (value) => value === "yes" || value === "designated";
const restrictedAccess = new Set(["private", "no", "customers", "permit"]);
const genericNames = new Set(["public restroom", "public restrooms", "restroom", "restrooms", "toilet", "toilets"]);

function inside(region, longitude, latitude) {
  return longitude >= region.west && longitude <= region.east && latitude >= region.south && latitude <= region.north;
}

function regionFor(longitude, latitude, regions) {
  return regions.find((region) => inside(region, longitude, latitude));
}

function addressFromTags(tags) {
  if (tags["addr:full"]) return trim(tags["addr:full"], 240);
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const locality = [tags["addr:city"], tags["addr:state"], tags["addr:postcode"]].filter(Boolean).join(", ");
  return trim([street, locality].filter(Boolean).join(", "), 240);
}

function osmFeatures(tags) {
  const features = [];
  if (yes(tags.wheelchair) || yes(tags["toilets:wheelchair"])) features.push("Accessible");
  if (yes(tags.baby_changing) || yes(tags.changing_table)) features.push("Baby changing");
  if (yes(tags.unisex) || tags.gender_segregated === "no") features.push("Gender neutral");
  if (tags.fee !== "yes") features.push("Free");
  if (tags["toilets:position"] === "seated" || tags.unisex === "yes") features.push("Single stall");
  return [...new Set(features)];
}

function osmDirections(tags) {
  if (tags.description) return trim(tags.description, 1000);
  if (tags.level) return `Look for restroom signs on level ${trim(tags.level, 60)}.`;
  if (tags.indoor === "yes") return "Located inside the building; follow posted restroom signs.";
  return "Use the map pin and look for public restroom signage.";
}

function safeDate(value, fallback = "1970-01-01T00:00:00.000Z") {
  const parsed = new Date(value || "");
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function mapOsmFeature(feature, regions) {
  const longitude = Number(feature?.geometry?.coordinates?.[0]);
  const latitude = Number(feature?.geometry?.coordinates?.[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  const region = scope === "all" ? { slug: "worldwide", label: "Worldwide" } : regionFor(longitude, latitude, regions);
  if (!region) return null;

  const tags = feature?.properties?.tags || {};
  if (tags.amenity !== "toilets" || restrictedAccess.has(tags.access) || tags.disused === "yes" || tags.abandoned === "yes") return null;
  const externalId = String(feature?.properties?.id || "");
  if (!externalId) return null;

  const taggedAddress = addressFromTags(tags);
  const operator = trim(tags.operator, 100);
  const name = trim(tags.name || (operator ? `${operator} Restroom` : "Public Restroom"), 120);
  const sourceUrl = `https://www.openstreetmap.org/node/${encodeURIComponent(externalId)}`;
  const source = {
    source: "openstreetmap",
    external_id: externalId,
    source_url: sourceUrl,
    observed_at: safeDate(tags.check_date),
    metadata: {
      region: region.slug,
      check_date: tags.check_date || null,
      access: tags.access || null,
      fee: tags.fee || null,
      wheelchair: tags.wheelchair || tags["toilets:wheelchair"] || null,
      unisex: tags.unisex || null,
      changing_table: tags.changing_table || tags.baby_changing || null,
    },
  };

  return {
    name,
    address: taggedAddress,
    description: trim(tags.description || "OpenStreetMap public-restroom map pin. Details have not been community verified.", 2000),
    directions: osmDirections(tags),
    hours: trim(tags.opening_hours || "Hours not listed", 240),
    latitude,
    longitude,
    is_open_now: null,
    access_code: null,
    access_instructions: trim(tags.access === "yes" || tags.access === "public" ? "Mapped as publicly accessible." : "Access details have not been community verified.", 500),
    cover_photo_url: String(tags.image || "").startsWith("http") ? trim(tags.image, 1000) : null,
    features: osmFeatures(tags),
    status: "published",
    last_verified_at: safeDate(tags.check_date),
    data_source: "openstreetmap",
    source_external_id: externalId,
    source_url: sourceUrl,
    source_metadata: source.metadata,
    sources: [source],
    region: region.slug,
  };
}

function plausibleRefugeRecord(record, region) {
  if (!record?.approved || !Number.isFinite(Number(record.latitude)) || !Number.isFinite(Number(record.longitude))) return false;
  if (!inside(region, Number(record.longitude), Number(record.latitude))) return false;
  if (region.country && String(record.country || "").toUpperCase() !== region.country) return false;
  const upvotes = Number(record.upvote || 0);
  const downvotes = Number(record.downvote || 0);
  if (downvotes >= 3 && downvotes > upvotes) return false;
  if (trim(record.name, 120).length < 2 || trim(record.street, 180).length < 2) return false;
  return true;
}

function mapRefugeRecord(record, region) {
  const state = trim(record.state, 80);
  const address = trim([record.street, record.city, state, record.country].filter(Boolean).join(", "), 240);
  const externalId = String(record.id);
  const sourceUrl = `https://www.refugerestrooms.org/restrooms/${encodeURIComponent(externalId)}`;
  const features = [];
  if (record.accessible) features.push("Accessible");
  if (record.unisex) features.push("Gender neutral", "Single stall");
  if (record.changing_table) features.push("Baby changing");
  const source = {
    source: "refuge",
    external_id: externalId,
    source_url: sourceUrl,
    observed_at: safeDate(record.updated_at),
    metadata: {
      region: region.slug,
      approved: true,
      country: record.country || null,
      upvote: Number(record.upvote || 0),
      downvote: Number(record.downvote || 0),
    },
  };

  return {
    name: trim(record.name, 120),
    address,
    description: trim(record.comment || "Safe-restroom listing supplied by REFUGE Restrooms.", 2000),
    directions: trim(record.directions || "Use the map pin and follow posted restroom signs.", 1000),
    hours: "Hours not listed",
    latitude: Number(record.latitude),
    longitude: Number(record.longitude),
    is_open_now: null,
    access_code: null,
    access_instructions: "Availability is sourced from REFUGE Restrooms and has not yet been community re-verified here.",
    cover_photo_url: null,
    features: [...new Set(features)],
    status: "published",
    last_verified_at: safeDate(record.updated_at),
    data_source: "refuge",
    source_external_id: externalId,
    source_url: sourceUrl,
    source_metadata: source.metadata,
    sources: [source],
    region: region.slug,
  };
}

async function fetchRefugeCandidates() {
  if (!includeRefuge) return [];
  const results = [];
  for (const region of PRIMARY_REGIONS) {
    try {
      let accepted = 0;
      let received = 0;
      for (let page = 1; page <= 50; page += 1) {
        const endpoint = new URL("https://www.refugerestrooms.org/api/v1/restrooms/search");
        endpoint.searchParams.set("query", region.refugeQuery);
        endpoint.searchParams.set("page", String(page));
        endpoint.searchParams.set("per_page", "100");
        const response = await fetch(endpoint, {
          headers: { "User-Agent": "IWANNAPEE restroom data importer (+https://www.iwannapee.lol)" },
          signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (!Array.isArray(payload) || payload.length === 0) break;
        const mapped = payload.filter((record) => plausibleRefugeRecord(record, region)).map((record) => mapRefugeRecord(record, region));
        results.push(...mapped);
        accepted += mapped.length;
        received += payload.length;
        if (payload.length < 100) break;
      }
      console.log(`REFUGE ${region.label}: accepted ${accepted} of ${received} records.`);
    } catch (error) {
      console.warn(`REFUGE ${region.label}: skipped after API failure (${error instanceof Error ? error.message : "unknown error"}).`);
    }
  }
  return results;
}

function radians(value) {
  return value * Math.PI / 180;
}

function distanceMeters(first, second) {
  const radius = 6_371_000;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(haversine));
}

function normalized(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

function meaningfulName(value) {
  const name = normalized(value);
  return name.length >= 4 && !genericNames.has(name) ? name : "";
}

function realAddress(value) {
  const address = normalized(value);
  return address.length >= 5 && !address.startsWith("map pin") && !address.startsWith("location shown") ? address : "";
}

function samePlace(first, second) {
  const distance = distanceMeters(first, second);
  if (distance <= 12) return true;
  if (distance > 50) return false;
  const firstName = meaningfulName(first.name);
  const secondName = meaningfulName(second.name);
  const nameMatch = firstName && secondName && (firstName === secondName || firstName.includes(secondName) || secondName.includes(firstName));
  const firstAddress = realAddress(first.address);
  const secondAddress = realAddress(second.address);
  const addressMatch = firstAddress && secondAddress && (firstAddress === secondAddress || firstAddress.includes(secondAddress) || secondAddress.includes(firstAddress));
  return Boolean(nameMatch || addressMatch);
}

const cellKey = (record) => `${Math.floor(record.latitude * 1000)}:${Math.floor(record.longitude * 1000)}`;

function nearbyCells(record) {
  const latitudeCell = Math.floor(record.latitude * 1000);
  const longitudeCell = Math.floor(record.longitude * 1000);
  const keys = [];
  for (let latitudeOffset = -1; latitudeOffset <= 1; latitudeOffset += 1) {
    for (let longitudeOffset = -1; longitudeOffset <= 1; longitudeOffset += 1) keys.push(`${latitudeCell + latitudeOffset}:${longitudeCell + longitudeOffset}`);
  }
  return keys;
}

function addToGrid(grid, record) {
  const key = cellKey(record);
  const values = grid.get(key) || [];
  values.push(record);
  grid.set(key, values);
}

function findSpatialMatch(grid, record) {
  for (const key of nearbyCells(record)) {
    for (const candidate of grid.get(key) || []) if (samePlace(record, candidate)) return candidate;
  }
  return null;
}

function mergeCandidates(current, incoming) {
  const preferred = incoming.data_source === "refuge" && current.data_source !== "refuge" ? incoming : current;
  const supporting = preferred === incoming ? current : incoming;
  return {
    ...preferred,
    address: realAddress(preferred.address) ? preferred.address : supporting.address,
    description: preferred.description || supporting.description,
    directions: preferred.directions || supporting.directions,
    features: [...new Set([...(preferred.features || []), ...(supporting.features || [])])],
    sources: [...preferred.sources, ...supporting.sources].filter((source, index, values) => values.findIndex((item) => item.source === source.source && item.external_id === source.external_id) === index),
    source_metadata: { ...preferred.source_metadata, supporting_sources: [...new Set([...preferred.sources, ...supporting.sources].map((source) => `${source.source}:${source.external_id}`))] },
  };
}

function deduplicateCandidates(candidates) {
  const grid = new Map();
  const deduplicated = [];
  for (const candidate of candidates) {
    const duplicate = findSpatialMatch(grid, candidate);
    if (!duplicate) {
      deduplicated.push(candidate);
      addToGrid(grid, candidate);
      continue;
    }
    const merged = mergeCandidates(duplicate, candidate);
    const index = deduplicated.indexOf(duplicate);
    deduplicated[index] = merged;
    const bucket = grid.get(cellKey(duplicate));
    if (bucket) bucket[bucket.indexOf(duplicate)] = merged;
  }
  return deduplicated;
}

async function readGeocodeCache() {
  try {
    return JSON.parse(await readFile(cachePath, "utf8"));
  } catch {
    return {};
  }
}

async function saveGeocodeCache(cache) {
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
}

async function reverseGeocode(record, cache) {
  const key = `${record.latitude.toFixed(6)},${record.longitude.toFixed(6)}`;
  if (cache[key]) return cache[key];
  const endpoint = new URL("https://api.geoapify.com/v1/geocode/reverse");
  endpoint.searchParams.set("lat", String(record.latitude));
  endpoint.searchParams.set("lon", String(record.longitude));
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("limit", "1");
  endpoint.searchParams.set("apiKey", process.env.GEOAPIFY_API_KEY);
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Geoapify HTTP ${response.status}`);
  const payload = await response.json();
  const result = payload?.results?.[0] || null;
  const address = trim(result?.formatted, 240);
  const resolved = address ? {
    address,
    distance: Number(result?.distance || 0),
    confidence: Number(result?.rank?.confidence || 0),
    attribution: result?.datasource?.attribution || "Geoapify",
  } : { address: "" };
  cache[key] = resolved;
  return resolved;
}

async function enrichAddresses(candidates) {
  const missing = candidates.filter((candidate) => !realAddress(candidate.address));
  if (!useReverseGeocoding) {
    console.log(`Addresses: ${missing.length} records still need reverse geocoding. Set GEOAPIFY_API_KEY to resolve and cache them before import.`);
    return candidates;
  }

  const cache = await readGeocodeCache();
  let cursor = 0;
  let resolvedCount = 0;
  let processed = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (cursor < missing.length) {
      const index = cursor;
      cursor += 1;
      const candidate = missing[index];
      try {
        const result = await reverseGeocode(candidate, cache);
        if (result.address) {
          candidate.address = result.address;
          candidate.source_metadata = { ...candidate.source_metadata, address_resolution: "geoapify_reverse", address_distance_meters: result.distance ?? null };
          resolvedCount += 1;
        }
      } catch (error) {
        console.warn(`Address lookup failed at ${candidate.latitude},${candidate.longitude}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
      processed += 1;
      if (processed % 50 === 0) {
        await saveGeocodeCache(cache);
        console.log(`Addresses: processed ${processed}/${missing.length}; resolved ${resolvedCount}.`);
      }
    }
  });
  await Promise.all(workers);
  await saveGeocodeCache(cache);
  console.log(`Addresses: resolved ${resolvedCount}/${missing.length}; cached at ${cachePath}.`);
  return candidates;
}

async function fetchPaged(supabase, table, columns) {
  const records = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(start, start + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    records.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return records;
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function databaseRow(candidate) {
  const row = { ...candidate };
  delete row.sources;
  delete row.region;
  return row;
}

async function seedDatabase(candidates) {
  const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { autoRefreshToken: false, persistSession: false } });
  const existing = await fetchPaged(supabase, "restrooms", "id,name,address,latitude,longitude,data_source,source_external_id,created_by");
  const sourceRecords = await fetchPaged(supabase, "restroom_source_records", "restroom_id,source,external_id");
  const sourceLookup = new Map(sourceRecords.map((record) => [`${record.source}:${record.external_id}`, record.restroom_id]));
  const existingById = new Map(existing.map((record) => [record.id, record]));
  const grid = new Map();
  existing.forEach((record) => addToGrid(grid, record));

  const resolvedIds = new Map();
  const candidatesToInsert = [];
  let matchedExisting = 0;
  for (const candidate of candidates) {
    const linkedId = candidate.sources.map((source) => sourceLookup.get(`${source.source}:${source.external_id}`)).find(Boolean);
    const spatial = linkedId ? existingById.get(linkedId) : findSpatialMatch(grid, candidate);
    if (linkedId || spatial) {
      resolvedIds.set(`${candidate.data_source}:${candidate.source_external_id}`, linkedId || spatial.id);
      matchedExisting += 1;
    } else {
      candidatesToInsert.push(candidate);
    }
  }

  let inserted = 0;
  for (const batch of chunks(candidatesToInsert, 100)) {
    const { data, error } = await supabase
      .from("restrooms")
      .upsert(batch.map(databaseRow), { onConflict: "data_source,source_external_id", ignoreDuplicates: true })
      .select("id,data_source,source_external_id");
    if (error) throw new Error(`restrooms import: ${error.message}`);
    inserted += data?.length || 0;
    for (const record of data || []) resolvedIds.set(`${record.data_source}:${record.source_external_id}`, record.id);
    console.log(`Database: wrote ${inserted}/${candidatesToInsert.length} new primary records.`);
  }

  for (const [dataSource, records] of Object.entries(Object.groupBy(candidates, (candidate) => candidate.data_source))) {
    for (const batch of chunks(records, 100)) {
      const ids = batch.map((candidate) => candidate.source_external_id);
      const { data, error } = await supabase.from("restrooms").select("id,data_source,source_external_id").eq("data_source", dataSource).in("source_external_id", ids);
      if (error) throw new Error(`restroom id lookup: ${error.message}`);
      for (const record of data || []) resolvedIds.set(`${record.data_source}:${record.source_external_id}`, record.id);
    }
  }

  const links = [];
  for (const candidate of candidates) {
    const restroomId = resolvedIds.get(`${candidate.data_source}:${candidate.source_external_id}`);
    if (!restroomId) throw new Error(`Could not resolve imported restroom ${candidate.data_source}:${candidate.source_external_id}.`);
    for (const source of candidate.sources) links.push({ restroom_id: restroomId, ...source, imported_at: new Date().toISOString() });
  }
  for (const batch of chunks(links, 200)) {
    const { error } = await supabase.from("restroom_source_records").upsert(batch, { onConflict: "source,external_id" });
    if (error) throw new Error(`source provenance import: ${error.message}`);
  }

  console.log(`Database complete: ${inserted} inserted, ${matchedExisting} matched existing, ${links.length} provenance links stored.`);
}

const selectedRegions = scope === "la-ny" ? PRIMARY_REGIONS : PRIORITY_REGIONS;
const fileStats = await stat(geojsonPath);
console.log(`Reading ${(fileStats.size / 1024 / 1024).toFixed(1)} MB GeoJSON from ${geojsonPath}…`);
const featureCollection = JSON.parse(await readFile(geojsonPath, "utf8"));
if (featureCollection?.type !== "FeatureCollection" || !Array.isArray(featureCollection.features)) throw new Error("Expected a GeoJSON FeatureCollection.");

const osmCandidates = featureCollection.features.map((feature) => mapOsmFeature(feature, selectedRegions)).filter(Boolean);
const refugeCandidates = await fetchRefugeCandidates();
const rawCandidates = [...osmCandidates, ...refugeCandidates];
const candidates = deduplicateCandidates(rawCandidates);
await enrichAddresses(candidates);

const regionCounts = Object.entries(Object.groupBy(candidates, (candidate) => candidate.region)).map(([region, records]) => `${region}: ${records.length}`).join(", ");
const missingAddresses = candidates.filter((candidate) => !realAddress(candidate.address)).length;
const addressedCandidates = candidates.filter((candidate) => realAddress(candidate.address));
console.log(`Prepared ${candidates.length} unique listings from ${rawCandidates.length} source records (${regionCounts}).`);
console.log(`Address coverage: ${candidates.length - missingAddresses}/${candidates.length}; unresolved: ${missingAddresses}.`);
if (resolvedOnly) console.log(`Resolved-only mode: ${addressedCandidates.length} listings are eligible for this import.`);

if (dryRun) {
  console.log("Dry run complete; database was not changed.");
} else if (missingAddresses > 0 && !resolvedOnly && !args.has("--allow-unresolved-addresses")) {
  throw new Error("Refusing to seed placeholder addresses. Add GEOAPIFY_API_KEY or explicitly pass --allow-unresolved-addresses.");
} else {
  await seedDatabase(resolvedOnly ? addressedCandidates : candidates);
}
