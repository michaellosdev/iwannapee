-- Production security, owner moderation, sample placements, and durable request limits.

alter table public.profiles
  add column if not exists role text not null default 'user';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'moderator', 'owner'));

update public.profiles
set role = 'moderator'
where is_moderator and role = 'user';

create or replace function public.sync_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.is_moderator := new.role in ('moderator', 'owner');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_sync_role on public.profiles;
create trigger profiles_sync_role
before insert or update of role on public.profiles
for each row execute procedure public.sync_profile_role();

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select profile.role in ('moderator', 'owner')
      from public.profiles profile
      where profile.id = auth.uid()
    ),
    false
  );
$$;

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- All content mutations now pass through authenticated server routes so the
-- application can enforce CAPTCHA, validation, and durable rate limits.
drop policy if exists "Signed-in users can submit pending restrooms" on public.restrooms;
drop policy if exists "Contributors can edit their pending restrooms" on public.restrooms;
drop policy if exists "Users can review published restrooms" on public.reviews;
drop policy if exists "Users can edit their own reviews" on public.reviews;
drop policy if exists "Users can delete their own reviews" on public.reviews;

revoke insert, update, delete on public.restrooms from authenticated;
revoke insert, update, delete on public.reviews from authenticated;

alter table public.restrooms
  add column if not exists cover_photo_storage_path text;

-- Keep public media in purpose-specific buckets. Writes are server-controlled;
-- public reads remain available for listing cards and profile images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('restroom-photos', 'restroom-photos', true, 8388608, array['image/jpeg', 'image/png', 'image/webp']),
  ('profile-avatars', 'profile-avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('business-creatives', 'business-creatives', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Restroom photos are public" on storage.objects;
drop policy if exists "Users can upload restroom photos to their folder" on storage.objects;
drop policy if exists "Users can manage their own restroom photos" on storage.objects;

create policy "IWANNAPEE public media is readable"
on storage.objects for select
using (bucket_id in ('restroom-photos', 'profile-avatars', 'business-creatives'));

-- Atomic, database-backed request limits survive serverless instance changes.
create table if not exists public.request_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now()
);

alter table public.request_rate_limits enable row level security;
revoke all on public.request_rate_limits from anon, authenticated;

create or replace function public.consume_rate_limit(
  p_key_hash text,
  p_max_requests integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz,
  current_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_limit public.request_rate_limits%rowtype;
  current_time timestamptz := now();
begin
  if char_length(p_key_hash) < 32
    or p_max_requests < 1
    or p_max_requests > 10000
    or p_window_seconds < 1
    or p_window_seconds > 604800 then
    raise exception 'Invalid rate-limit arguments';
  end if;

  insert into public.request_rate_limits (
    key_hash,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_key_hash,
    current_time,
    1,
    current_time
  )
  on conflict (key_hash) do update set
    window_started_at = case
      when public.request_rate_limits.window_started_at
        <= current_time - make_interval(secs => p_window_seconds)
      then current_time
      else public.request_rate_limits.window_started_at
    end,
    request_count = case
      when public.request_rate_limits.window_started_at
        <= current_time - make_interval(secs => p_window_seconds)
      then 1
      else public.request_rate_limits.request_count + 1
    end,
    updated_at = current_time
  returning * into current_limit;

  return query select
    current_limit.request_count <= p_max_requests,
    greatest(p_max_requests - current_limit.request_count, 0),
    current_limit.window_started_at + make_interval(secs => p_window_seconds),
    current_limit.request_count;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- Event receipts make Stripe webhook handling idempotent and auditable.
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'failed')),
  attempt_count integer not null default 1,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;

-- Test campaigns are visible only to the authenticated owner who created them.
alter table public.advertising_campaigns
  add column if not exists is_test boolean not null default false;

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

-- Neutral public RPC path avoids false positives from content blockers while
-- retaining the original function for older deployed clients during rollout.
create or replace function public.nearby_business_promotions(
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
  select *
  from public.nearby_advertisements(user_lat, user_lng);
$$;

grant execute on function public.nearby_business_promotions(double precision, double precision)
to anon, authenticated;
