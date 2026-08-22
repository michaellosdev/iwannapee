-- Location-targeted restroom advertising.
-- Campaigns are created as pending_payment and can only be activated by the
-- server-side Stripe webhook (or a moderator using an elevated Supabase key).

create table public.advertising_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  business_name text not null check (char_length(business_name) between 2 and 120),
  restroom_name text not null check (char_length(restroom_name) between 2 and 120),
  address text not null check (char_length(address) between 5 and 240),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  location extensions.geography(point, 4326)
    generated always as (
      extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
    ) stored,
  hours text check (hours is null or char_length(hours) <= 160),
  directions text check (directions is null or char_length(directions) <= 500),
  headline text not null check (char_length(headline) between 4 and 100),
  offer_text text not null check (char_length(offer_text) between 4 and 280),
  promo_code text check (promo_code is null or char_length(promo_code) <= 40),
  qr_target_url text check (qr_target_url is null or qr_target_url ~* '^https?://'),
  destination_url text check (destination_url is null or destination_url ~* '^https?://'),
  radius_meters integer not null default 8047 check (radius_meters between 1609 and 24140),
  price_cents integer not null default 500 check (price_cents between 100 and 100000),
  placement_bid_cents integer not null default 0 check (placement_bid_cents between 0 and 100000),
  currency text not null default 'usd' check (currency = 'usd'),
  duration_days integer not null default 7 check (duration_days between 1 and 365),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'active', 'expired', 'cancelled', 'rejected')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index advertising_campaigns_location_idx
  on public.advertising_campaigns using gist (location);
create index advertising_campaigns_active_idx
  on public.advertising_campaigns (status, starts_at, ends_at);
create index advertising_campaigns_owner_idx
  on public.advertising_campaigns (created_by, created_at desc);

alter table public.advertising_campaigns enable row level security;

revoke all on table public.advertising_campaigns from anon, authenticated;
-- All campaign writes flow through the server-only checkout/webhook clients.
-- This prevents advertisers from changing price or bid fields after a Stripe
-- Checkout Session has been created.
-- Public reads go through nearby_advertisements so payment identifiers and
-- exact bid amounts are never exposed to browser clients.

create or replace function public.nearby_advertisements(
  user_lat double precision,
  user_lng double precision
)
returns table (
  campaign_id uuid,
  business_name text,
  restroom_name text,
  address text,
  latitude double precision,
  longitude double precision,
  hours text,
  directions text,
  headline text,
  offer_text text,
  promo_code text,
  qr_target_url text,
  destination_url text,
  ends_at timestamptz,
  distance_meters double precision,
  placement_rank bigint,
  priority_placement boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select
      campaign.*,
      extensions.st_distance(
        campaign.location,
        extensions.st_setsrid(extensions.st_makepoint(user_lng, user_lat), 4326)::extensions.geography
      ) as distance_meters
    from public.advertising_campaigns campaign
    where
      campaign.status = 'active'
      and campaign.starts_at <= now()
      and campaign.ends_at > now()
      and extensions.st_dwithin(
        campaign.location,
        extensions.st_setsrid(extensions.st_makepoint(user_lng, user_lat), 4326)::extensions.geography,
        campaign.radius_meters
      )
  ),
  ranked as (
    select
      eligible.*,
      row_number() over (
        order by
          eligible.placement_bid_cents desc,
          eligible.distance_meters asc,
          eligible.created_at asc
      ) as placement_rank
    from eligible
  )
  select
    campaign.id,
    campaign.business_name,
    campaign.restroom_name,
    campaign.address,
    campaign.latitude,
    campaign.longitude,
    campaign.hours,
    campaign.directions,
    campaign.headline,
    campaign.offer_text,
    campaign.promo_code,
    campaign.qr_target_url,
    campaign.destination_url,
    campaign.ends_at,
    campaign.distance_meters,
    campaign.placement_rank,
    campaign.placement_bid_cents > 0 as priority_placement
  from ranked campaign
  order by campaign.placement_rank
  limit 3;
$$;

grant execute on function public.nearby_advertisements(double precision, double precision)
to anon, authenticated;
