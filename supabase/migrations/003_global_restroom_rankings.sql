-- Worldwide community leaderboard. Low-review listings are confidence-weighted
-- toward a neutral score so one perfect review cannot outrank established places.

create index restrooms_global_ranking_idx
  on public.restrooms (rating desc, cleanliness_rating desc, review_count desc)
  where status = 'published' and review_count > 0;

create or replace function public.global_restroom_rankings(
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
  last_verified_at timestamptz
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
    restroom.last_verified_at
  from ranked restroom
  order by restroom.rank_position
  limit greatest(1, least(limit_count, 20));
$$;

grant execute on function public.global_restroom_rankings(integer)
to anon, authenticated;
