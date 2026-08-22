# IWANNAPEE

A community-powered public restroom finder: OpenStreetMap discovery, map and list views, access codes, indoor directions, photos, accessibility filters, cleanliness scores, magic-link sign-in, submissions, reviews, and location-targeted restroom promotions with promo codes or QR destinations.

## Start locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without environment variables, the app discovers nearby public restrooms through OpenStreetMap; if that service is unavailable, it falls back to illustrative Los Angeles data.

## Connect Supabase

1. Create a Supabase project.
2. Run all files in `supabase/migrations/` in filename order, including `004_stripe_payment_lifecycle.sql`, or link the Supabase CLI and run `supabase db push`.
3. Optionally run `supabase/seed.sql`. The seed records are illustrative and must be verified before public launch.
4. Copy `.env.example` to `.env.local` and provide:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_SITE_URL=https://www.iwannapee.lol
```

5. In Supabase Authentication → URL Configuration, add these redirect URLs:

```text
http://localhost:3000/auth/callback
https://www.iwannapee.lol/auth/callback
```

6. Enable email magic links in Supabase Authentication. The application uses PKCE and exchanges the callback code at `/auth/callback`.

For production, set the Supabase **Site URL** to `https://www.iwannapee.lol`, add `https://www.iwannapee.lol/auth/callback` to the allowed redirect URLs, and configure the Stripe webhook endpoint as `https://www.iwannapee.lol/api/stripe/webhook`. Point both the apex domain and `www.iwannapee.lol` at the deployment, with the apex redirecting permanently to the `www` canonical domain.

Run `003_global_restroom_rankings.sql` after the initial schema and advertising migration. It adds the homepage worldwide leaderboard. Rankings use 70% overall rating, 30% cleanliness, and a confidence adjustment equivalent to five neutral reviews, preventing a single perfect review from automatically taking first place. Sponsored campaigns are excluded.

## Google Analytics 4

The app uses the public measurement ID from `NEXT_PUBLIC_GA4_ID`. The current property is configured as:

```dotenv
NEXT_PUBLIC_GA4_ID=G-061DRKJ3ET
```

Analytics uses Google advanced consent mode. The tag loads immediately with all storage and advertising consent types denied, allowing limited cookieless visit measurement. Accepting grants analytics storage, ad storage, ad user data, and ad personalization; declining keeps all four denied. Visitors can change the choice later from **Privacy settings** in the footer, and declining does not affect the map, sign-in, submissions, or checkout.

Before launch, confirm the GA4 web data stream URL is `https://www.iwannapee.lol`, publish or approve the site's privacy/cookie language, and verify an accepted visit in GA4 Realtime or DebugView. Do not send email addresses, access codes, promo codes, review text, or other free-form form values as analytics parameters.

## Address autocomplete

Homepage search, restroom submissions, and advertising addresses use [Photon](https://github.com/komoot/photon), an OpenStreetMap geocoder designed for search-as-you-type. The public demo service is suitable for development and modest traffic. For production volume, self-host Photon and set:

```dotenv
GEOCODER_BASE_URL=https://your-photon-host.example
```

Autocomplete waits for three characters, debounces requests, supports keyboard selection, biases suggestions toward the current map location, and preserves the manual Place pin action as a fallback.

## Enable local advertising payments

Advertisements are created as `pending_payment` records through a server-only Supabase client. The browser never chooses the base price or activates a campaign: the checkout route applies and bounds the server-configured offer, and a verified Stripe webhook changes a paid campaign to `active` only after the campaign ID, Checkout Session ID, currency, and paid total all match.

Checkout Session creation uses Stripe request retries plus a campaign-scoped idempotency key. Full refunds and newly created disputes automatically stop eligible campaigns through signed webhook events. The success page is informational only and verifies that the signed-in user owns the Checkout Session; it never activates advertising.

Add these server-only variables to `.env.local` and your hosting environment:

```dotenv
SUPABASE_SECRET_KEY=your-supabase-secret-key
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
AD_PRICE_CENTS=500
AD_DURATION_DAYS=7
AD_RADIUS_METERS=8047
AD_MAX_PLACEMENT_BID_CENTS=10000
```

For local Stripe testing, forward events to the included webhook route:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use Stripe test mode first. Complete a Checkout Session and confirm the matching `advertising_campaigns` row changes from `pending_payment` to `active`; redirects alone do not activate an ad.

Create webhook endpoints for local/test and production environments and subscribe to:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
charge.refunded
charge.dispute.created
```

The production endpoint is `https://www.iwannapee.lol/api/stripe/webhook`. Stripe currently has no live webhook endpoint for this account, so create it only after the production deployment is reachable. Enable successful-payment email receipts in Stripe Dashboard if you want Stripe to email advertisers automatically. Configure Stripe Tax only after confirming the tax treatment and registrations for the countries where advertising is sold.

## Search setup

The app publishes an indexable homepage, canonical metadata for `https://www.iwannapee.lol`, a generated social card, `WebSite` and logo structured data, `/robots.txt`, `/sitemap.xml`, and `/manifest.webmanifest`.

After deploying, add `iwannapee.lol` as a domain property in Google Search Console and complete DNS verification. Submit `https://www.iwannapee.lol/sitemap.xml`, then inspect `https://www.iwannapee.lol/` and request indexing. If you use Search Console's HTML-tag verification instead, place only the token value in the production environment:

```dotenv
GOOGLE_SITE_VERIFICATION=
```

Google discovery and rankings are not immediate or guaranteed. Search-visible restroom and city pages will require unique, indexable URLs as the verified database grows; avoid publishing thin or duplicated location pages.

Each eligible local search has three sponsored slots. The $5 base price makes a campaign eligible for those slots for seven days. An advertiser can add an optional one-time placement bid at Checkout; campaigns rank by bid first, distance second, then campaign creation time. This is not cost-per-click advertising, and a bid does not guarantee placement when three higher eligible bids are nearby. The server clamps the bid to `AD_MAX_PLACEMENT_BID_CENTS`, records it with the campaign, and sends the base listing and bid to Stripe as separate line items.

## Restroom data sources

The live nearby endpoint already uses [OpenStreetMap restroom data through Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API) as the global discovery layer. OpenStreetMap data is available under the [Open Database License](https://www.openstreetmap.org/copyright), so production attribution and share-alike obligations must be preserved. The public Overpass instance is appropriate for development and modest use, not an unlimited production backend; cache responses and plan a hosted extract or managed provider as traffic grows.

Useful official regional supplements include:

- [New York City Public Restrooms](https://data.cityofnewyork.us/City-Government/Public-Restrooms/i7jb-7jku), which includes coordinates, hours, accessibility, changing stations, operational status, and notes.
- [San Francisco Map of Public Bathrooms](https://data.sfgov.org/City-Infrastructure/Map-of-Public-Bathrooms/sxtt-wsyn), a centralized city dataset intended to locate restrooms and populate maps.
- [Australia National Public Toilet Map](https://catalogue.data.infrastructure.gov.au/dataset/rdh-nationalpublictoiletmap), a national open dataset with roughly 19,000 facilities and a monthly update schedule.

Treat all imported data as a starting point rather than a real-time availability guarantee. Hours, codes, closures, and cleanliness still need community verification and a visible reporting workflow. [REFUGE Restrooms](https://www.refugerestrooms.org/api/docs/) is also relevant for safe and gender-neutral listings, but its database reuse terms should be confirmed before bulk importing user-submitted records.

## Moderation model

- Public visitors can read only `published` restrooms and reviews.
- Signed-in contributors create `pending` restroom submissions.
- Moderators are profiles with `is_moderator = true`; set this only from the Supabase dashboard or a service-role process.
- Reviews update aggregate overall and cleanliness scores automatically.
- Suggested updates and reports have separate queues in the schema.
- Sponsored restrooms are always disclosed and are returned only when the visitor is inside the campaign radius and the campaign is active and unexpired. At most three sponsored campaigns are returned per local search; priority bids rank ahead of standard sponsored listings and distance breaks ties.
- Photo uploads are limited to 8 MB JPEG, PNG, or WebP files in a user-owned storage folder.

Access codes and hours can change quickly. Before launch, add a visible reporting workflow and a moderator dashboard, establish listing rules, and verify that each seeded or imported restroom is genuinely open to the public.

## Verification

```bash
npm run check
npm run build
```
