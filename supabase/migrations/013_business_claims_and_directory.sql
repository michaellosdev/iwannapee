-- Verified business ownership, public business profiles, launch-week rewards,
-- and a shared priority queue for owner moderation.

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  restroom_id uuid not null unique references public.restrooms(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null check (char_length(business_name) between 2 and 120),
  description text check (description is null or char_length(description) <= 1200),
  profile_image_url text check (profile_image_url is null or profile_image_url ~* '^https?://'),
  profile_image_storage_path text,
  cover_image_url text check (cover_image_url is null or cover_image_url ~* '^https?://'),
  cover_image_storage_path text,
  website_url text check (website_url is null or website_url ~* '^https?://'),
  public_email text check (public_email is null or char_length(public_email) <= 254),
  phone text check (phone is null or char_length(phone) <= 40),
  instagram_url text check (instagram_url is null or instagram_url ~* '^https?://'),
  facebook_url text check (facebook_url is null or facebook_url ~* '^https?://'),
  tiktok_url text check (tiktok_url is null or tiktok_url ~* '^https?://'),
  promotion_headline text check (promotion_headline is null or char_length(promotion_headline) between 4 and 100),
  promotion_offer_text text check (promotion_offer_text is null or char_length(promotion_offer_text) between 4 and 280),
  promotion_code text check (promotion_code is null or char_length(promotion_code) <= 40),
  status text not null default 'verified' check (status in ('verified', 'suspended')),
  verified_at timestamptz not null default now(),
  verified_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz not null default now(),
  launch_reward_granted_at timestamptz,
  launch_campaign_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_profiles_owner_idx
  on public.business_profiles (owner_user_id, updated_at desc);
create index if not exists business_profiles_public_idx
  on public.business_profiles (status, verified_at desc);

create table if not exists public.business_claims (
  id uuid primary key default gen_random_uuid(),
  restroom_id uuid not null references public.restrooms(id) on delete cascade,
  claimant_user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null check (char_length(business_name) between 2 and 120),
  claimant_role text not null check (char_length(claimant_role) between 2 and 80),
  contact_email text not null check (char_length(contact_email) between 3 and 254),
  business_email text check (business_email is null or char_length(business_email) <= 254),
  website_url text check (website_url is null or website_url ~* '^https?://'),
  proof_details text check (proof_details is null or char_length(proof_details) <= 2000),
  status text not null default 'pending'
    check (status in ('pending', 'needs_info', 'approved', 'rejected', 'withdrawn')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 2000),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists business_claims_one_open_per_user_restroom_idx
  on public.business_claims (restroom_id, claimant_user_id)
  where status in ('pending', 'needs_info');
create index if not exists business_claims_queue_idx
  on public.business_claims (status, priority, created_at);

create table if not exists public.admin_queue_priorities (
  resource_type text not null check (resource_type in (
    'business_claim', 'restroom', 'community_photo', 'community_note',
    'restroom_update', 'report', 'campaign', 'profile'
  )),
  resource_id uuid not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  note text check (note is null or char_length(note) <= 500),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (resource_type, resource_id)
);

alter table public.business_profiles enable row level security;
alter table public.business_claims enable row level security;
alter table public.admin_queue_priorities enable row level security;

revoke all on public.business_profiles from anon, authenticated;
revoke all on public.business_claims from anon, authenticated;
revoke all on public.admin_queue_priorities from anon, authenticated;

create policy "Verified business profiles are public"
on public.business_profiles for select
using (status = 'verified');

create policy "Owners can read their business profiles"
on public.business_profiles for select to authenticated
using (owner_user_id = auth.uid());

create policy "Claimants can read their claims"
on public.business_claims for select to authenticated
using (claimant_user_id = auth.uid());

grant select on public.business_profiles to anon, authenticated;
grant select on public.business_claims to authenticated;

alter table public.advertising_campaigns
  drop constraint if exists advertising_campaigns_price_cents_check;

alter table public.advertising_campaigns
  add constraint advertising_campaigns_price_cents_check
    check (price_cents between 0 and 100000),
  add column if not exists is_complimentary boolean not null default false,
  add column if not exists complimentary_reason text
    check (complimentary_reason is null or char_length(complimentary_reason) <= 160),
  add column if not exists business_profile_id uuid references public.business_profiles(id) on delete set null;

create index if not exists advertising_campaigns_business_profile_idx
  on public.advertising_campaigns (business_profile_id, created_at desc)
  where business_profile_id is not null;

alter table public.business_profiles
  add constraint business_profiles_launch_campaign_fk
  foreign key (launch_campaign_id) references public.advertising_campaigns(id) on delete set null;

-- Expose the complimentary marker to the owner dashboard without making any
-- private ownership or payment identifiers browser-readable.
drop function if exists public.business_promotion_analytics();

create function public.business_promotion_analytics()
returns table (
  campaign_id uuid,
  business_name text,
  restroom_name text,
  address text,
  headline text,
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

-- Owner API calls this service-role-only function after reviewing emailed
-- proof. The profile, community verification, and free launch placement are
-- created in one transaction so a partially approved claim cannot leak out.
create or replace function public.approve_business_claim(
  p_claim_id uuid,
  p_admin_id uuid
)
returns table (business_profile_id uuid, launch_campaign_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim public.business_claims%rowtype;
  restroom public.restrooms%rowtype;
  new_profile_id uuid;
  new_campaign_id uuid;
  approved_at timestamptz := now();
begin
  select * into claim from public.business_claims where id = p_claim_id for update;
  if claim.id is null or claim.status not in ('pending', 'needs_info') then
    raise exception 'Claim is no longer available for approval';
  end if;
  if exists (select 1 from public.business_profiles where restroom_id = claim.restroom_id and status = 'verified') then
    raise exception 'This restroom already has a verified business profile';
  end if;
  select * into restroom from public.restrooms where id = claim.restroom_id and status = 'published';
  if restroom.id is null then raise exception 'Restroom is not published'; end if;

  insert into public.business_profiles (
    restroom_id, owner_user_id, business_name, website_url, public_email,
    promotion_headline, promotion_offer_text, status, verified_at,
    verified_by, claimed_at, launch_reward_granted_at
  ) values (
    claim.restroom_id, claim.claimant_user_id, claim.business_name,
    claim.website_url, claim.business_email,
    'Community-verified restroom',
    'A verified local business welcoming restroom visitors.',
    'verified', approved_at, p_admin_id, claim.created_at, approved_at
  ) returning id into new_profile_id;

  insert into public.restroom_verifications (restroom_id, user_id, verdict, updated_at)
  values (claim.restroom_id, p_admin_id, 'confirmed', approved_at)
  on conflict (restroom_id, user_id) do update set verdict = 'confirmed', updated_at = excluded.updated_at;

  insert into public.advertising_campaigns (
    created_by, business_name, restroom_name, address, latitude, longitude,
    hours, hours_schedule_status, timezone, weekly_hours, directions, headline,
    offer_text, destination_url, radius_meters, price_cents,
    placement_bid_cents, support_amount_cents, currency, duration_days, status,
    is_test, is_complimentary, complimentary_reason, business_profile_id,
    restroom_id, starts_at, ends_at
  ) values (
    claim.claimant_user_id, claim.business_name, restroom.name, restroom.address,
    restroom.latitude, restroom.longitude, restroom.hours,
    restroom.hours_schedule_status, restroom.timezone, restroom.weekly_hours,
    restroom.directions, 'Community-verified restroom',
    'A verified local business welcoming restroom visitors.', claim.website_url,
    8047, 0, 0, 0, 'usd', 7, 'active', false, true,
    'Verified business launch reward', new_profile_id, restroom.id,
    approved_at, approved_at + interval '7 days'
  ) returning id into new_campaign_id;

  update public.business_profiles set launch_campaign_id = new_campaign_id where id = new_profile_id;
  update public.business_claims set status = 'approved', reviewed_by = p_admin_id,
    reviewed_at = approved_at, updated_at = approved_at where id = claim.id;

  return query select new_profile_id, new_campaign_id;
end;
$$;

revoke all on function public.approve_business_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function public.approve_business_claim(uuid, uuid) to service_role;
