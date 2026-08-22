-- Right2Pee initial data model.
-- Run with `supabase db push` or paste into the Supabase SQL editor.

create extension if not exists pgcrypto;
create extension if not exists postgis with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  is_moderator boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.restrooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  address text not null check (char_length(address) between 5 and 240),
  description text,
  directions text,
  hours text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  location extensions.geography(point, 4326)
    generated always as (
      extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
    ) stored,
  is_open_now boolean not null default true,
  access_code text check (access_code is null or char_length(access_code) <= 40),
  access_instructions text check (access_instructions is null or char_length(access_instructions) <= 500),
  cover_photo_url text,
  features text[] not null default '{}',
  rating numeric(3, 2) not null default 0,
  cleanliness_rating numeric(3, 2) not null default 0,
  review_count integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index restrooms_location_idx on public.restrooms using gist (location);
create index restrooms_status_idx on public.restrooms (status);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  restroom_id uuid not null references public.restrooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  overall_rating smallint not null check (overall_rating between 1 and 5),
  cleanliness_rating smallint not null check (cleanliness_rating between 1 and 5),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restroom_id, user_id)
);

create table public.restroom_updates (
  id uuid primary key default gen_random_uuid(),
  restroom_id uuid not null references public.restrooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  update_type text not null check (update_type in ('code', 'hours', 'access', 'closed', 'other')),
  proposed_value text not null check (char_length(proposed_value) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  restroom_id uuid not null references public.restrooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('not_public', 'unsafe', 'closed', 'wrong_code', 'wrong_location', 'other')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.restrooms enable row level security;
alter table public.reviews enable row level security;
alter table public.restroom_updates enable row level security;
alter table public.reports enable row level security;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_moderator from public.profiles where id = auth.uid()), false);
$$;

create policy "Profiles are readable by their owners"
on public.profiles for select
using (id = auth.uid() or public.is_moderator());

create policy "Users can update their own profile"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid() and is_moderator = false);

create policy "Published restrooms are public"
on public.restrooms for select
using (status = 'published' or created_by = auth.uid() or public.is_moderator());

create policy "Signed-in users can submit pending restrooms"
on public.restrooms for insert to authenticated
with check (created_by = auth.uid() and status = 'pending');

create policy "Contributors can edit their pending restrooms"
on public.restrooms for update to authenticated
using ((created_by = auth.uid() and status = 'pending') or public.is_moderator())
with check ((created_by = auth.uid() and status = 'pending') or public.is_moderator());

create policy "Published reviews are public"
on public.reviews for select
using (status = 'published' or user_id = auth.uid() or public.is_moderator());

create policy "Users can review published restrooms"
on public.reviews for insert to authenticated
with check (
  user_id = auth.uid()
  and status = 'published'
  and exists (select 1 from public.restrooms where id = restroom_id and status = 'published')
);

create policy "Users can edit their own reviews"
on public.reviews for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete their own reviews"
on public.reviews for delete to authenticated
using (user_id = auth.uid());

create policy "Contributors can read their suggested updates"
on public.restroom_updates for select to authenticated
using (user_id = auth.uid() or public.is_moderator());

create policy "Users can suggest corrections"
on public.restroom_updates for insert to authenticated
with check (user_id = auth.uid() and status = 'pending');

create policy "Moderators can review corrections"
on public.restroom_updates for update to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy "Users can submit reports"
on public.reports for insert
with check (user_id is null or user_id = auth.uid());

create policy "Moderators can read reports"
on public.reports for select to authenticated
using (public.is_moderator());

create policy "Moderators can resolve reports"
on public.reports for update to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

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
    last_verified_at = now(),
    updated_at = now()
  where id = target_restroom_id;
  return coalesce(new, old);
end;
$$;

create trigger reviews_update_restroom_totals
after insert or update or delete on public.reviews
for each row execute procedure public.update_restroom_rating_totals();

create or replace function public.nearby_restrooms(
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
  distance_meters double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.id,
    r.name,
    r.address,
    r.description,
    r.directions,
    r.hours,
    r.latitude,
    r.longitude,
    r.is_open_now,
    r.access_code,
    r.access_instructions,
    r.cover_photo_url,
    r.features,
    r.rating,
    r.cleanliness_rating,
    r.review_count,
    r.last_verified_at,
    extensions.st_distance(
      r.location,
      extensions.st_setsrid(extensions.st_makepoint(user_lng, user_lat), 4326)::extensions.geography
    ) as distance_meters
  from public.restrooms r
  where
    r.status = 'published'
    and extensions.st_dwithin(
      r.location,
      extensions.st_setsrid(extensions.st_makepoint(user_lng, user_lat), 4326)::extensions.geography,
      greatest(100, least(radius_m, 50000))
    )
  order by distance_meters asc
  limit 100;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restroom-photos',
  'restroom-photos',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "Restroom photos are public"
on storage.objects for select
using (bucket_id = 'restroom-photos');

create policy "Users can upload restroom photos to their folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'restroom-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can manage their own restroom photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'restroom-photos'
  and owner_id = auth.uid()::text
);
