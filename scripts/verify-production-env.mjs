const canonicalSiteUrl = "https://www.iwannapee.lol";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_GA4_ID",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "NEXT_PUBLIC_MAP_TILE_URL",
  "NEXT_PUBLIC_MAP_TILE_ATTRIBUTION",
  "NEXT_PUBLIC_SENTRY_DSN",
  "SUPABASE_SECRET_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_INTEGRATION_IDENTIFIER",
  "TURNSTILE_SECRET_KEY",
  "CAPTCHA_SESSION_SECRET",
  "RATE_LIMIT_SECRET",
  "CRON_SECRET",
  "OWNER_EMAILS",
  "SENTRY_DSN",
  "SENTRY_ENVIRONMENT",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "SENTRY_AUTH_TOKEN",
  "AD_PRICE_CENTS",
  "AD_RADIUS_METERS",
  "AD_MAX_PLACEMENT_BID_CENTS",
];

const errors = [];
const warnings = [];

function value(name) {
  return process.env[name]?.trim() ?? "";
}

function isPlaceholder(candidate) {
  return (
    !candidate ||
    /^(change-me|replace-me|todo)$/i.test(candidate) ||
    /(^|[./_-])your([./_-]|$)/i.test(candidate) ||
    candidate.includes("example")
  );
}

function requireUrl(name, options = {}) {
  const candidate = value(name);
  if (!candidate || isPlaceholder(candidate)) return;

  try {
    const url = new URL(candidate.replaceAll("{z}", "0").replaceAll("{x}", "0").replaceAll("{y}", "0"));
    if (url.protocol !== "https:") errors.push(`${name} must use HTTPS.`);
    if (options.forbiddenHosts?.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      errors.push(`${name} points at a public community endpoint that is not approved for production traffic.`);
    }
  } catch {
    errors.push(`${name} must be a valid URL.`);
  }
}

for (const name of required) {
  if (isPlaceholder(value(name))) errors.push(`${name} is missing or still a placeholder.`);
}

if (value("NEXT_PUBLIC_SITE_URL") !== canonicalSiteUrl) {
  errors.push(`NEXT_PUBLIC_SITE_URL must be ${canonicalSiteUrl}.`);
}

if (value("NEXT_PUBLIC_GA4_ID") !== "G-061DRKJ3ET") {
  errors.push("NEXT_PUBLIC_GA4_ID must be G-061DRKJ3ET.");
}

if (!value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY").startsWith("sb_publishable_")) {
  errors.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY does not look like a publishable Supabase key.");
}

if (
  !value("SUPABASE_SECRET_KEY").startsWith("sb_secret_") &&
  value("SUPABASE_SECRET_KEY").split(".").length !== 3
) {
  errors.push("SUPABASE_SECRET_KEY does not look like a Supabase secret/service-role key.");
}

if (!value("STRIPE_SECRET_KEY").startsWith("sk_live_")) {
  errors.push("STRIPE_SECRET_KEY must be a live-mode key for the production deployment.");
}

if (!value("STRIPE_WEBHOOK_SECRET").startsWith("whsec_")) {
  errors.push("STRIPE_WEBHOOK_SECRET does not look like a Stripe webhook signing secret.");
}

if (!value("NEXT_PUBLIC_TURNSTILE_SITE_KEY").startsWith("0x")) {
  errors.push("NEXT_PUBLIC_TURNSTILE_SITE_KEY does not look like a Cloudflare Turnstile site key.");
}

if (!value("TURNSTILE_SECRET_KEY").startsWith("0x")) {
  errors.push("TURNSTILE_SECRET_KEY does not look like a Cloudflare Turnstile secret key.");
}

for (const name of ["CAPTCHA_SESSION_SECRET", "RATE_LIMIT_SECRET", "CRON_SECRET"]) {
  if (value(name).length < 32) errors.push(`${name} must contain at least 32 characters.`);
}

for (const name of ["AD_PRICE_CENTS", "AD_RADIUS_METERS", "AD_MAX_PLACEMENT_BID_CENTS"]) {
  const parsed = Number(value(name));
  if (!Number.isSafeInteger(parsed) || parsed <= 0) errors.push(`${name} must be a positive integer.`);
}

requireUrl("NEXT_PUBLIC_SUPABASE_URL");
requireUrl("NEXT_PUBLIC_SENTRY_DSN");
requireUrl("SENTRY_DSN");
requireUrl("NEXT_PUBLIC_MAP_TILE_URL", {
  forbiddenHosts: ["tile.openstreetmap.org", "openstreetmap.org"],
});

const geocoderUrl = value("GEOCODER_BASE_URL");
const geoapifyKey = value("GEOAPIFY_API_KEY");
if (isPlaceholder(geocoderUrl) && isPlaceholder(geoapifyKey)) {
  errors.push("Configure GEOAPIFY_API_KEY or a managed/self-hosted GEOCODER_BASE_URL.");
}
if (!isPlaceholder(geocoderUrl)) {
  requireUrl("GEOCODER_BASE_URL", {
    forbiddenHosts: ["photon.komoot.io", "nominatim.openstreetmap.org"],
  });
}

const restroomApiUrl = value("RESTROOM_DATA_API_URL");
if (!isPlaceholder(restroomApiUrl)) {
  requireUrl("RESTROOM_DATA_API_URL", {
    forbiddenHosts: ["overpass-api.de", "overpass.kumi.systems", "overpass.nchc.org.tw"],
  });
} else {
  warnings.push("RESTROOM_DATA_API_URL is not configured; production discovery will use only seeded Supabase records.");
}

if (!value("OWNER_EMAILS").split(",").some((email) => email.trim().includes("@"))) {
  errors.push("OWNER_EMAILS must include at least one email address.");
}

if (value("NEXT_PUBLIC_SENTRY_DSN") !== value("SENTRY_DSN")) {
  warnings.push("Browser and server Sentry DSNs differ; confirm that this is intentional.");
}

for (const name of [
  "SUPABASE_DB_URL",
  "SUPABASE_RESTORE_TEST_DB_URL",
  "SUPABASE_RESTORE_TEST_URL",
  "SUPABASE_RESTORE_TEST_SECRET_KEY",
  "RESTROOM_GEOJSON_PATH",
]) {
  if (value(name)) warnings.push(`${name} is operator-only and should not be stored in the production hosting environment.`);
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  console.error(`Production environment verification failed with ${errors.length} error(s). No secret values were printed.`);
  process.exit(1);
}

console.log("Production environment verification passed. No secret values were printed.");
