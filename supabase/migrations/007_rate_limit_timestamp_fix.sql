-- Avoid PostgreSQL's CURRENT_TIME keyword when calculating durable windows.

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
  observed_at timestamptz := now();
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
    observed_at,
    1,
    observed_at
  )
  on conflict (key_hash) do update set
    window_started_at = case
      when public.request_rate_limits.window_started_at
        <= observed_at - make_interval(secs => p_window_seconds)
      then observed_at
      else public.request_rate_limits.window_started_at
    end,
    request_count = case
      when public.request_rate_limits.window_started_at
        <= observed_at - make_interval(secs => p_window_seconds)
      then 1
      else public.request_rate_limits.request_count + 1
    end,
    updated_at = observed_at
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
