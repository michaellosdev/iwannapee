-- Campaign owners can stop or soft-delete promotions without changing payment
-- history. Full refunds remain an owner-admin-only server action in Stripe.

alter table public.advertising_campaigns
  add column if not exists stopped_at timestamptz,
  add column if not exists stopped_by uuid references auth.users(id) on delete set null,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists refund_requested_at timestamptz,
  add column if not exists refund_requested_by uuid references auth.users(id) on delete set null;

alter table public.advertising_campaigns
  drop constraint if exists advertising_campaigns_deleted_inactive_check;

alter table public.advertising_campaigns
  add constraint advertising_campaigns_deleted_inactive_check
  check (deleted_at is null or status not in ('pending_payment', 'active'));

create index if not exists advertising_campaigns_owner_visible_idx
  on public.advertising_campaigns (created_by, created_at desc)
  where deleted_at is null;

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
    and campaign.deleted_at is null
  group by campaign.id
  order by campaign.created_at desc;
$$;

revoke all on function public.business_promotion_analytics() from public, anon;
grant execute on function public.business_promotion_analytics() to authenticated;
