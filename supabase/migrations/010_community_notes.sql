-- Threaded community notes with one vote per user and owner moderation.
-- All browser access is routed through rate-limited server handlers.

create table if not exists public.community_notes (
  id uuid primary key default gen_random_uuid(),
  restroom_id uuid not null references public.restrooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.community_notes(id) on delete cascade,
  body text not null check (char_length(body) between 2 and 600),
  status text not null default 'published' check (status in ('published', 'hidden', 'rejected')),
  upvote_count integer not null default 0 check (upvote_count >= 0),
  downvote_count integer not null default 0 check (downvote_count >= 0),
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);

create index if not exists community_notes_restroom_idx
  on public.community_notes (restroom_id, created_at desc)
  where status = 'published';

create index if not exists community_notes_parent_idx
  on public.community_notes (parent_id, created_at)
  where parent_id is not null and status = 'published';

create index if not exists community_notes_moderation_idx
  on public.community_notes (created_at desc);

alter table public.community_notes enable row level security;
revoke all on public.community_notes from anon, authenticated;

create table if not exists public.community_note_votes (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.community_notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (note_id, user_id)
);

create index if not exists community_note_votes_note_idx
  on public.community_note_votes (note_id);

alter table public.community_note_votes enable row level security;
revoke all on public.community_note_votes from anon, authenticated;

create or replace function public.refresh_community_note_vote_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_note_id uuid := coalesce(new.note_id, old.note_id);
begin
  update public.community_notes note
  set
    upvote_count = totals.upvotes,
    downvote_count = totals.downvotes,
    updated_at = now()
  from (
    select
      count(*) filter (where value = 1)::integer as upvotes,
      count(*) filter (where value = -1)::integer as downvotes
    from public.community_note_votes
    where note_id = target_note_id
  ) totals
  where note.id = target_note_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists community_note_votes_refresh_totals on public.community_note_votes;
create trigger community_note_votes_refresh_totals
after insert or update or delete on public.community_note_votes
for each row execute procedure public.refresh_community_note_vote_totals();
