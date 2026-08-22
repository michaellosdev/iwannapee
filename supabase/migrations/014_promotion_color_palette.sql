-- Advertisers choose one of ten reviewed presentation colors. Store only a
-- palette key so arbitrary CSS never enters public campaign rendering.

begin;

alter table public.advertising_campaigns
  add column if not exists color_key text not null default 'aqua';

alter table public.advertising_campaigns
  drop constraint if exists advertising_campaigns_color_key_check;

alter table public.advertising_campaigns
  add constraint advertising_campaigns_color_key_check
  check (color_key in ('aqua', 'sky', 'blue', 'mint', 'green', 'yellow', 'orange', 'coral', 'pink', 'lavender'));

drop function if exists public.nearby_business_promotions(double precision, double precision);
drop function if exists public.nearby_advertisements(double precision, double precision);

create function public.nearby_advertisements(
  user_lat double precision,
  user_lng double precision
)
returns table (
  campaign_id uuid,
  restroom_id uuid,
  business_name text,
  restroom_name text,
  address text,
  latitude double precision,
  longitude double precision,
  hours text,
  is_open_now boolean,
  directions text,
  headline text,
  offer_text text,
  color_key text,
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
      and (not campaign.is_test or campaign.created_by = auth.uid())
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
        order by eligible.placement_bid_cents desc, eligible.distance_meters asc, eligible.created_at asc
      ) as placement_rank
    from eligible
  )
  select
    campaign.id,
    campaign.restroom_id,
    campaign.business_name,
    campaign.restroom_name,
    campaign.address,
    campaign.latitude,
    campaign.longitude,
    campaign.hours,
    public.schedule_is_open(campaign.hours_schedule_status, campaign.timezone, campaign.weekly_hours),
    campaign.directions,
    campaign.headline,
    campaign.offer_text,
    campaign.color_key,
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

create function public.nearby_business_promotions(
  user_lat double precision,
  user_lng double precision
)
returns table (
  campaign_id uuid,
  restroom_id uuid,
  business_name text,
  restroom_name text,
  address text,
  latitude double precision,
  longitude double precision,
  hours text,
  is_open_now boolean,
  directions text,
  headline text,
  offer_text text,
  color_key text,
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
  select * from public.nearby_advertisements(user_lat, user_lng);
$$;

grant execute on function public.nearby_business_promotions(double precision, double precision)
to anon, authenticated;

drop function if exists public.business_promotion_analytics();

create function public.business_promotion_analytics()
returns table (
  campaign_id uuid,
  business_name text,
  restroom_name text,
  address text,
  headline text,
  color_key text,
  status text,
  is_test boolean,
  is_complimentary boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz,
  price_cents integer,
  placement_bid_cents integer,
  support_amount_cents integer,
  impression_count bigint,
  detail_open_count bigint,
  promo_copy_count bigint,
  qr_copy_count bigint,
  website_click_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    campaign.id,
    campaign.business_name,
    campaign.restroom_name,
    campaign.address,
    campaign.headline,
    campaign.color_key,
    campaign.status,
    campaign.is_test,
    campaign.is_complimentary,
    campaign.starts_at,
    campaign.ends_at,
    campaign.created_at,
    campaign.price_cents,
    campaign.placement_bid_cents,
    campaign.support_amount_cents,
    count(event.id) filter (where event.event_type = 'impression'),
    count(event.id) filter (where event.event_type = 'detail_open'),
    count(event.id) filter (where event.event_type = 'promo_copy'),
    count(event.id) filter (where event.event_type = 'qr_copy'),
    count(event.id) filter (where event.event_type = 'website_click')
  from public.advertising_campaigns campaign
  left join public.promotion_activity_events event on event.campaign_id = campaign.id
  where campaign.created_by = auth.uid()
    and campaign.deleted_at is null
  group by campaign.id
  order by campaign.created_at desc;
$$;

revoke all on function public.business_promotion_analytics() from public, anon;
grant execute on function public.business_promotion_analytics() to authenticated;

commit;
