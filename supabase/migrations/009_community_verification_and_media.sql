-- Explicit community verification and moderated restroom/review photography.
-- Imported source timestamps remain provenance only; they never imply that an
-- IWANNAPEE user has confirmed the restroom.

alter table public.restrooms
  add column if not exists community_verified_at timestamptz,
  add column if not exists community_verification_count integer not null default 0
    check (community_verification_count >= 0),
  add column if not exists community_not_found_count integer not null default 0
    check (community_not_found_count >= 0);

create table if not exists public.restroom_verifications (
  id uuid primary key default gen_random_uuid(),
  restroom_id uuid not null references public.restrooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  verdict text not null check (verdict in ('confirmed', 'not_found')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restroom_id, user_id)
);

create index if not exists restroom_verifications_restroom_idx
  on public.restroom_verifications (restroom_id, updated_at desc);

alter table public.restroom_verifications enable row level security;
revoke all on public.restroom_verifications from anon, authenticated;

create or replace function public.refresh_restroom_verification_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_restroom_id uuid := coalesce(new.restroom_id, old.restroom_id);
begin
  update public.restrooms restroom
  set
    community_verification_count = summary.confirmed_count,
    community_not_found_count = summary.not_found_count,
    community_verified_at = case
      when summary.confirmed_count > summary.not_found_count then summary.latest_confirmation
      else null
    end,
    updated_at = now()
  from (
    select
      count(*) filter (where verdict = 'confirmed')::integer as confirmed_count,
      count(*) filter (where verdict = 'not_found')::integer as not_found_count,
      max(updated_at) filter (where verdict = 'confirmed') as latest_confirmation
    from public.restroom_verifications
    where restroom_id = target_restroom_id
  ) summary
  where restroom.id = target_restroom_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists restroom_verifications_refresh_totals on public.restroom_verifications;
create trigger restroom_verifications_refresh_totals
after insert or update or delete on public.restroom_verifications
for each row execute procedure public.refresh_restroom_verification_totals();

-- A published community submission was supplied by a signed-in user as a
-- recently checked location. Seed that contributor as its first confirmation.
-- Imported OSM and REFUGE rows deliberately remain unverified.
insert into public.restroom_verifications (
  restroom_id,
  user_id,
  verdict,
  created_at,
  updated_at
)
select
  restroom.id,
  restroom.created_by,
  'confirmed',
  restroom.created_at,
  restroom.created_at
from public.restrooms restroom
where restroom.status = 'published'
  and restroom.data_source = 'community'
  and restroom.created_by is not null
on conflict (restroom_id, user_id) do nothing;

create table if not exists public.community_photos (
  id uuid primary key default gen_random_uuid(),
  restroom_id uuid not null references public.restrooms(id) on delete cascade,
  review_id uuid references public.reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) between 10 and 500),
  public_url text not null check (char_length(public_url) between 10 and 1200),
  caption text check (caption is null or char_length(caption) <= 240),
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected', 'hidden')),
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists community_photos_restroom_idx
  on public.community_photos (restroom_id, created_at desc)
  where status = 'published';

create index if not exists community_photos_review_idx
  on public.community_photos (review_id, created_at)
  where review_id is not null and status = 'published';

create index if not exists community_photos_moderation_idx
  on public.community_photos (created_at)
  where status = 'pending';

alter table public.community_photos enable row level security;
revoke all on public.community_photos from anon, authenticated;

-- Reviews affect rating aggregates but do not prove that the location itself
-- was recently verified. Existence verification has its own explicit signal.
create or replace function public.update_restroom_rating_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_restroom_id uuid := coalesce(new.restroom_id, old.restroom_id);
begin
  update public.restrooms
  set
    rating = coalesce((select round(avg(overall_rating)::numeric, 2) from public.reviews where restroom_id = target_restroom_id and status = 'published'), 0),
    cleanliness_rating = coalesce((select round(avg(cleanliness_rating)::numeric, 2) from public.reviews where restroom_id = target_restroom_id and status = 'published'), 0),
    review_count = (select count(*) from public.reviews where restroom_id = target_restroom_id and status = 'published'),
    updated_at = now()
  where id = target_restroom_id;
  return coalesce(new, old);
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
  community_verified_at timestamptz,
  community_verification_count integer,
  community_not_found_count integer,
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
    restroom.community_verified_at,
    restroom.community_verification_count,
    restroom.community_not_found_count,
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
  source_url text,
  community_verified_at timestamptz,
  community_verification_count integer,
  community_not_found_count integer
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
    restroom.source_url,
    restroom.community_verified_at,
    restroom.community_verification_count,
    restroom.community_not_found_count
  from ranked restroom
  order by restroom.rank_position
  limit greatest(1, least(limit_count, 20));
$$;

grant execute on function public.global_restroom_rankings(integer)
to anon, authenticated;
