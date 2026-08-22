# IWANNAPEE production runbook

This is the launch order for `https://www.iwannapee.lol`. Do not deploy the
protected mutation routes before migrations `005` through `010` are available: the
routes deliberately fail closed when durable request limiting is unavailable.

## 1. Required production variables

Copy names from `.env.production.example`; never copy local test values blindly.
After loading the hosting production environment, run
`npm run verify:production-env`. The command reports variable names only and
fails for placeholders, test-mode Stripe keys, public community provider URLs,
or missing launch-critical settings.

### Public browser variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL=https://www.iwannapee.lol`
- `NEXT_PUBLIC_GA4_ID=G-061DRKJ3ET`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `NEXT_PUBLIC_MAP_TILE_URL` from a managed tile provider
- `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION`
- `NEXT_PUBLIC_SENTRY_DSN` when Sentry is enabled
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`

### Server-only variables

- `SUPABASE_SECRET_KEY`
- `STRIPE_SECRET_KEY` (live key only in production)
- `STRIPE_WEBHOOK_SECRET` for the production webhook endpoint
- `STRIPE_INTEGRATION_IDENTIFIER`
- `TURNSTILE_SECRET_KEY`
- `CAPTCHA_SESSION_SECRET`
- `RATE_LIMIT_SECRET`
- `CRON_SECRET`
- `OWNER_EMAILS`
- `GEOAPIFY_API_KEY`, or a private/managed `GEOCODER_BASE_URL`
- `RESTROOM_DATA_API_URL` only when using a managed Overpass-compatible service
- Sentry variables: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`,
  `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_ORG`, `SENTRY_PROJECT`, and
  `SENTRY_AUTH_TOKEN`
- Advertising limits: `AD_PRICE_CENTS`, `AD_DURATION_DAYS`,
  `AD_RADIUS_METERS`, and `AD_MAX_PLACEMENT_BID_CENTS`

Never add `SUPABASE_DB_URL`, restore-test credentials, or
`RESTROOM_GEOJSON_PATH` to Vercel. Those are operator-only variables.

## 2. Supabase

1. Run migrations `001` through `010` in filename order.
2. Confirm `request_rate_limits`, `stripe_webhook_events`,
   `restroom_source_records`, `community_photos`, `community_notes`,
   `community_note_votes`, and the three Storage buckets exist.
3. Set the owner profile role to `owner`. `OWNER_EMAILS` remains the independent
   server-side owner allowlist.
4. Set Authentication Site URL to `https://www.iwannapee.lol` and allow
   `https://www.iwannapee.lol/auth/callback`.
5. Smoke-test a real magic link, owner `/admin`, a pending submission, approval,
   a review, a signed photo upload and moderation, and a community note/reply/vote.

## 3. Initial restroom import

The importer filters restricted locations, preserves source attribution,
deduplicates by source and proximity, and refuses unresolved coordinate
placeholders by default.

```bash
npm run seed:restrooms -- \
  --geojson /absolute/path/to/toilets.geojson \
  --scope=la-ny \
  --dry-run
```

Add a server-only `GEOAPIFY_API_KEY`, rerun the dry run, review the final counts,
then remove `--dry-run` to seed. Use `--scope=priority` only after confirming
database capacity and provider credits. Preserve visible OpenStreetMap, REFUGE,
and Geoapify attribution.

When a reverse-geocoding key is not yet available, pass `--resolved-only` to
seed only records that already have trustworthy source addresses. Coordinate-
only records remain excluded and can be added later from the cached import.

## 4. Deployment and health

1. Deploy to a preview first and run `npm run check` and `npm run build` against
   the exact commit.
2. Smoke-test `/`, `/robots.txt`, `/sitemap.xml`, `/api/health`, Turnstile,
   autocomplete, login, submission, review, upload, owner moderation, and the
   owner-only sample advertisement.
3. Deploy production. `/api/health` must return HTTP 200.
   Run `npm run smoke:production` immediately afterward to verify the canonical
   page, security headers, robots, sitemap, and health response together.
4. Vercel invokes `/api/cron/health` daily using `CRON_SECRET`. On Sentry, add an
   email alert for the `iwannapee-production-health` monitor and application
   errors. The daily schedule works on Vercel Hobby; Pro can use a more frequent
   schedule if the Sentry monitor configuration is changed to match.
5. Keep an independent external HTTPS uptime check pointed at `/api/health` if
   faster-than-daily notification is required.

## 5. Stripe

The production endpoint is:

```text
https://www.iwannapee.lol/api/stripe/webhook
```

Subscribe to Checkout completion/failure/expiration, refunds, and disputes.
Send a Stripe test webhook first. Confirm duplicate delivery is idempotent and
that redirects never activate campaigns. Use the owner-only sample-ad form in
`/admin` to test placement, bidding, promo codes, and QR rendering without a
payment.

## 6. Analytics and search

1. GA4 must remain `G-061DRKJ3ET`. Realtime currently receives traffic. Enable
   URL-query-parameter redaction in the GA4 web stream in addition to the
   application’s query-free `page_location`.
2. In Realtime/DebugView verify only allowlisted event names and pathname-only
   page locations. Never send search text, email, access codes, review text,
   promo codes, precise user coordinates, or other free-form values.
3. Add `iwannapee.lol` as a Search Console Domain property, complete DNS
   verification, submit `https://www.iwannapee.lol/sitemap.xml`, inspect the
   homepage, and request indexing.

## 7. Backup and restore proof

Database backups do not contain Storage object bytes. Test both paths against a
disposable Supabase project—never the production target.

```bash
npm run backup:storage -- .data/backups/storage-prelaunch
npm run restore:test:storage -- .data/backups/storage-prelaunch
npm run restore:test:database
```

The restore scripts refuse the source project and require explicit disposable-
target confirmation variables. The database test compares every application
table count, while the Storage test downloads each restored object and verifies
its SHA-256 checksum. Record the backup date, restored row/object counts, and
the operator who verified the result.

## Launch gate

Launch is not proven by a local build alone. Required evidence is: migrations
present in the hosted project, production variables present, deployed commit
identified, live health and user-flow smoke tests passing, a disposable restore
test passing, Sentry alert delivery tested, Stripe webhook delivery tested,
GA4 privacy verified, and Search Console verification/indexing requested.
