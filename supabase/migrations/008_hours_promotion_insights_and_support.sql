-- Structured local-time hours, privacy-preserving promotion analytics, optional
-- project support, and a rateable restroom record behind each paid promotion.

alter table public.restrooms
  alter column is_open_now drop default,
  add column if not exists hours_schedule_status text not null default 'unknown'
    check (hours_schedule_status in ('unknown', 'scheduled', 'always_open', 'temporarily_closed')),
  add column if not exists timezone text
    check (timezone is null or char_length(timezone) between 3 and 80),
  add column if not exists weekly_hours jsonb not null default '[]'::jsonb
    check (jsonb_typeof(weekly_hours) = 'array');

update public.restrooms
set hours_schedule_status = 'always_open', weekly_hours = '[]'::jsonb
where lower(trim(coalesce(hours, ''))) in ('24/7', 'open 24 hours', 'open 24hrs', 'open 24 hrs');

alter table public.advertising_campaigns
  drop constraint if exists advertising_campaigns_hours_check;

alter table public.advertising_campaigns
  add constraint advertising_campaigns_hours_check
    check (hours is null or char_length(hours) <= 240),
  add column if not exists hours_schedule_status text not null default 'unknown'
    check (hours_schedule_status in ('unknown', 'scheduled', 'always_open', 'temporarily_closed')),
  add column if not exists timezone text
    check (timezone is null or char_length(timezone) between 3 and 80),
  add column if not exists weekly_hours jsonb not null default '[]'::jsonb
    check (jsonb_typeof(weekly_hours) = 'array'),
  add column if not exists support_amount_cents integer not null default 0
    check (support_amount_cents between 0 and 100000),
  add column if not exists restroom_id uuid references public.restrooms(id) on delete set null;

create index if not exists advertising_campaigns_restroom_idx
  on public.advertising_campaigns (restroom_id)
  where restroom_id is not null;

create or replace function public.schedule_is_open(
  schedule_status text,
  schedule_timezone text,
  schedule_periods jsonb,
  observed_at timestamptz default now()
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  local_at timestamp;
  local_weekday integer;
  local_minutes integer;
  period jsonb;
  period_weekday integer;
  opens_minutes integer;
  closes_minutes integer;
begin
  if schedule_status = 'always_open' then return true; end if;
  if schedule_status = 'temporarily_closed' then return false; end if;
  if schedule_status <> 'scheduled' or schedule_timezone is null or jsonb_typeof(schedule_periods) <> 'array' then
    return null;
  end if;

  local_at := observed_at at time zone schedule_timezone;
  local_weekday := extract(dow from local_at)::integer;
  local_minutes := (extract(hour from local_at)::integer * 60) + extract(minute from local_at)::integer;

  for period in select value from jsonb_array_elements(schedule_periods)
  loop
    period_weekday := (period ->> 'weekday')::integer;
    opens_minutes := split_part(period ->> 'opensAt', ':', 1)::integer * 60
      + split_part(period ->> 'opensAt', ':', 2)::integer;
    closes_minutes := split_part(period ->> 'closesAt', ':', 1)::integer * 60
      + split_part(period ->> 'closesAt', ':', 2)::integer;

    if opens_minutes < closes_minutes
      and period_weekday = local_weekday
      and local_minutes >= opens_minutes
      and local_minutes < closes_minutes then
      return true;
    end if;

    if opens_minutes > closes_minutes and (
      (period_weekday = local_weekday and local_minutes >= opens_minutes)
      or ((period_weekday + 1) % 7 = local_weekday and local_minutes < closes_minutes)
    ) then
      return true;
    end if;
  end loop;

  return false;
exception when others then
  return null;
end;
$$;

drop function if exists public.nearby_restrooms(double precision, double precision, integer);

create function public.nearby_restrooms(
  user_lat double precision,
  user_lng double precision,
  radius_m integer default 8000
)
returns table (
  id uuid,
  name text,
  address text,
  description text,
  directions text,
  hours text,
  latitude double precision,
  longitude double precision,
  is_open_now boolean,
  access_code text,
  access_instructions text,
  cover_photo_url text,
  features text[],
  rating numeric,
  cleanliness_rating numeric,
  review_count integer,
  last_verified_at timestamptz,
  data_source text,
  source_url text,
  distance_meters double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    restroom.id,
    restroom.name,
    restroom.address,
    restroom.description,
    restroom.directions,
    restroom.hours,
    restroom.latitude,
    restroom.longitude,
    public.schedule_is_open(restroom.hours_schedule_status, restroom.timezone, restroom.weekly_hours),
    restroom.access_code,
    restroom.access_instructions,
    restroom.cover_photo_url,
    restroom.features,
    restroom.rating,
    restroom.cleanliness_rating,
    restroom.review_count,
    restroom.last_verified_at,
    restroom.data_source,
    restroom.source_url,
    extensions.st_distance(
      restroom.location,
      extensions.st_setsrid(extensions.st_makepoint(user_lng, user_lat), 4326)::extensions.geography
    ) as distance_meters
  from public.restrooms restroom
  where
    restroom.status = 'published'
    and extensions.st_dwithin(
      restroom.location,
      extensions.st_setsrid(extensions.st_makepoint(user_lng, user_lat), 4326)::extensions.geography,
      greatest(100, least(radius_m, 50000))
    )
  order by distance_meters asc
  limit 100;
$$;

grant execute on function public.nearby_restrooms(double precision, double precision, integer)
to anon, authenticated;

drop function if exists public.global_restroom_rankings(integer);

create function public.global_restroom_rankings(
  limit_count integer default 6
)
returns table (
  rank_position bigint,
  ranking_score numeric,
  id uuid,
  name text,
  address text,
  description text,
  directions text,
  hours text,
  latitude double precision,
  longitude double precision,
  is_open_now boolean,
  access_code text,
  access_instructions text,
  cover_photo_url text,
  features text[],
  rating numeric,
  cleanliness_rating numeric,
  review_count integer,
  last_verified_at timestamptz,
  data_source text,
  source_url text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with scored as (
    select
      restroom.*,
      round(
        ((((restroom.rating * 0.70) + (restroom.cleanliness_rating * 0.30)) * restroom.review_count) + (3.50 * 5))
        / (restroom.review_count + 5),
        3
      ) as ranking_score
    from public.restrooms restroom
    where restroom.status = 'published' and restroom.review_count > 0
  ),
  ranked as (
    select
      scored.*,
      row_number() over (
        order by scored.ranking_score desc, scored.rating desc, scored.cleanliness_rating desc,
          scored.review_count desc, scored.last_verified_at desc
      ) as rank_position
    from scored
  )
  select
    restroom.rank_position,
    restroom.ranking_score,
    restroom.id,
    restroom.name,
    restroom.address,
    restroom.description,
    restroom.directions,
    restroom.hours,
    restroom.latitude,
    restroom.longitude,
    public.schedule_is_open(restroom.hours_schedule_status, restroom.timezone, restroom.weekly_hours),
    restroom.access_code,
    restroom.access_instructions,
    restroom.cover_photo_url,
    restroom.features,
    restroom.rating,
    restroom.cleanliness_rating,
    restroom.review_count,
    restroom.last_verified_at,
    restroom.data_source,
    restroom.source_url
  from ranked restroom
  order by restroom.rank_position
  limit greatest(1, least(limit_count, 20));
$$;

grant execute on function public.global_restroom_rankings(integer)
to anon, authenticated;

-- Recreate both public promotion functions with a linked restroom and computed
-- opening status. The neutral name remains the browser-facing entrypoint.
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

create table if not exists public.promotion_activity_events (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.advertising_campaigns(id) on delete cascade,
  event_type text not null check (event_type in ('impression', 'detail_open', 'promo_copy', 'qr_copy', 'website_click')),
  view_token_hash text not null check (char_length(view_token_hash) = 64),
  occurred_at timestamptz not null default now(),
  unique (campaign_id, event_type, view_token_hash)
);

create index if not exists promotion_activity_events_campaign_idx
  on public.promotion_activity_events (campaign_id, occurred_at desc);

alter table public.promotion_activity_events enable row level security;
revoke all on table public.promotion_activity_events from anon, authenticated;

create or replace function public.business_promotion_analytics()
returns table (
  campaign_id uuid,
  business_name text,
  restroom_name text,
  address text,
  headline text,
  status text,
  is_test boolean,
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
    campaign.status,
    campaign.is_test,
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
  group by campaign.id
  order by campaign.created_at desc;
$$;

revoke all on function public.business_promotion_analytics() from public, anon;
grant execute on function public.business_promotion_analytics() to authenticated;

create or replace function public.ensure_campaign_restroom(p_campaign_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign public.advertising_campaigns%rowtype;
  linked_restroom_id uuid;
begin
  select * into campaign
  from public.advertising_campaigns
  where id = p_campaign_id
  for update;

  if campaign.id is null then raise exception 'Campaign not found'; end if;
  if campaign.restroom_id is not null then return campaign.restroom_id; end if;

  select restroom.id into linked_restroom_id
  from public.restrooms restroom
  where restroom.status = 'published'
    and extensions.st_dwithin(restroom.location, campaign.location, 45)
  order by
    case when lower(trim(restroom.address)) = lower(trim(campaign.address)) then 0 else 1 end,
    extensions.st_distance(restroom.location, campaign.location),
    restroom.created_at
  limit 1;

  if linked_restroom_id is null then
    insert into public.restrooms (
      name, address, description, directions, hours, latitude, longitude,
      is_open_now, features, status, created_by, data_source, source_metadata,
      hours_schedule_status, timezone, weekly_hours
    ) values (
      campaign.restroom_name,
      campaign.address,
      'Business-submitted public restroom awaiting community verification.',
      campaign.directions,
      campaign.hours,
      campaign.latitude,
      campaign.longitude,
      null,
      '{}'::text[],
      'pending',
      campaign.created_by,
      'community',
      jsonb_build_object('created_from_campaign', campaign.id),
      campaign.hours_schedule_status,
      campaign.timezone,
      campaign.weekly_hours
    ) returning id into linked_restroom_id;
  end if;

  update public.advertising_campaigns
  set restroom_id = linked_restroom_id, updated_at = now()
  where id = campaign.id;

  return linked_restroom_id;
end;
$$;

revoke all on function public.ensure_campaign_restroom(uuid) from public, anon, authenticated;
grant execute on function public.ensure_campaign_restroom(uuid) to service_role;

