-- Structured restroom-detail suggestions with one vote per signed-in user.
-- Suggestions stay pending until an owner accepts or rejects them.

alter table public.restroom_updates
  drop constraint if exists restroom_updates_update_type_check;

alter table public.restroom_updates
  add constraint restroom_updates_update_type_check
    check (update_type in ('code', 'hours', 'access', 'closed', 'directions', 'description', 'other')),
  add column if not exists proposed_payload jsonb
    check (proposed_payload is null or jsonb_typeof(proposed_payload) = 'object'),
  add column if not exists upvote_count integer not null default 0
    check (upvote_count >= 0),
  add column if not exists downvote_count integer not null default 0
    check (downvote_count >= 0),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists restroom_updates_pending_restroom_idx
  on public.restroom_updates (restroom_id, created_at desc)
  where status = 'pending';

create table if not exists public.restroom_update_votes (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.restroom_updates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (update_id, user_id)
);

create index if not exists restroom_update_votes_update_idx
  on public.restroom_update_votes (update_id);

alter table public.restroom_update_votes enable row level security;
revoke all on public.restroom_update_votes from anon, authenticated;

create or replace function public.refresh_restroom_update_vote_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_update_id uuid := coalesce(new.update_id, old.update_id);
begin
  update public.restroom_updates suggestion
  set
    upvote_count = totals.upvotes,
    downvote_count = totals.downvotes,
    updated_at = now()
  from (
    select
      count(*) filter (where value = 1)::integer as upvotes,
      count(*) filter (where value = -1)::integer as downvotes
    from public.restroom_update_votes
    where update_id = target_update_id
  ) totals
  where suggestion.id = target_update_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists restroom_update_votes_refresh_totals on public.restroom_update_votes;
create trigger restroom_update_votes_refresh_totals
after insert or update or delete on public.restroom_update_votes
for each row execute procedure public.refresh_restroom_update_vote_totals();
