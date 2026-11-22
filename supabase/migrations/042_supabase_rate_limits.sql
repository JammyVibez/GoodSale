-- 042_supabase_rate_limits.sql
--
-- Shared API rate limiting backed by Postgres, replacing the Upstash Redis and
-- Rust/Redis limiters. One backend (Supabase) now serves rate limits, auth,
-- data and storage.
--
-- Fixed-window counters: the bucket id embeds the window slot, so every window
-- starts a fresh row and no sweep job is required for correctness. A cheap
-- opportunistic delete runs whenever a new window's first hit lands.

create table if not exists public.rate_limits (
  bucket text primary key,
  hits integer not null default 0,
  expires_at timestamptz not null
);

create index if not exists rate_limits_expires_at_idx on public.rate_limits (expires_at);

-- No policies: only the SECURITY DEFINER function below (or the service role)
-- may touch this table.
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer default 60,
  p_window_ms integer default 60000
)
returns table (allowed boolean, remaining integer, retry_after_ms integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_ms integer := greatest(1000, least(coalesce(p_window_ms, 60000), 3600000));
  v_limit integer := greatest(1, least(coalesce(p_limit, 60), 1000000));
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_slot bigint := v_now_ms / v_window_ms;
  v_bucket text := 'rl:' || md5(coalesce(p_key, '')) || ':' || v_slot::text;
  v_hits integer;
  v_reset_ms integer := ((v_slot + 1) * v_window_ms - v_now_ms)::integer;
begin
  insert into public.rate_limits (bucket, hits, expires_at)
  values (v_bucket, 1, to_timestamp(((v_slot + 1) * v_window_ms) / 1000.0))
  on conflict (bucket) do update set hits = public.rate_limits.hits + 1
  returning public.rate_limits.hits into v_hits;

  if v_hits = 1 then
    delete from public.rate_limits where expires_at < now() - interval '5 minutes';
  end if;

  allowed := v_hits <= v_limit;
  remaining := greatest(v_limit - v_hits, 0);
  retry_after_ms := case when v_hits <= v_limit then 0 else greatest(v_reset_ms, 1) end;
  return next;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public;
grant execute on function public.check_rate_limit(text, integer, integer) to anon, authenticated, service_role;

comment on function public.check_rate_limit(text, integer, integer) is
  'Fixed-window counter used by the Next.js middleware and API routes for shared rate limiting.';
