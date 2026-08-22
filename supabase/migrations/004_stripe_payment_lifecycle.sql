-- Keep sponsored campaigns from remaining visible after a full refund or a
-- payment dispute. The signed Stripe webhook is the only normal writer for
-- these states.

alter table public.advertising_campaigns
  drop constraint if exists advertising_campaigns_status_check;

alter table public.advertising_campaigns
  add constraint advertising_campaigns_status_check
  check (status in (
    'pending_payment',
    'active',
    'expired',
    'cancelled',
    'rejected',
    'refunded',
    'disputed'
  ));

alter table public.advertising_campaigns
  add column if not exists payment_refunded_at timestamptz,
  add column if not exists payment_disputed_at timestamptz;

create unique index if not exists advertising_campaigns_payment_intent_idx
  on public.advertising_campaigns (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
