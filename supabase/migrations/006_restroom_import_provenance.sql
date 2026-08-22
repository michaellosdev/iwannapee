-- Provenance for public restroom datasets. Imported listings remain distinct from
-- community submissions and retain enough source information for attribution,
-- deduplication, and future refreshes.

alter table public.restrooms
  alter column is_open_now drop not null;

alter table public.restrooms
  add column if not exists data_source text not null default 'community'
    check (data_source in ('community', 'openstreetmap', 'refuge')),
  add column if not exists source_external_id text,
  add column if not exists source_url text,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

create unique index if not exists restrooms_source_external_id_idx
  on public.restrooms (data_source, source_external_id)
  ;

create index if not exists restrooms_data_source_idx
  on public.restrooms (data_source)
  where status = 'published';

create table if not exists public.restroom_source_records (
  id bigint generated always as identity primary key,
  restroom_id uuid not null references public.restrooms(id) on delete cascade,
  source text not null check (source in ('openstreetmap', 'refuge')),
  external_id text not null,
  source_url text not null,
  metadata jsonb not null default '{}'::jsonb,
  observed_at timestamptz,
  imported_at timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists restroom_source_records_restroom_idx
  on public.restroom_source_records (restroom_id);

alter table public.restroom_source_records enable row level security;

comment on table public.restroom_source_records is
  'Server-managed provenance aliases for imported restroom records. No direct browser writes.';

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
    restroom.is_open_now,
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
        (
          (
            ((restroom.rating * 0.70) + (restroom.cleanliness_rating * 0.30))
            * restroom.review_count
          )
          + (3.50 * 5)
        ) / (restroom.review_count + 5),
        3
      ) as ranking_score
    from public.restrooms restroom
    where restroom.status = 'published' and restroom.review_count > 0
  ),
  ranked as (
    select
      scored.*,
      row_number() over (
        order by
          scored.ranking_score desc,
          scored.rating desc,
          scored.cleanliness_rating desc,
          scored.review_count desc,
          scored.last_verified_at desc
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
    restroom.is_open_now,
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
