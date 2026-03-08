create table if not exists public.telegram_subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  chat_id bigint unique,
  alerts_enabled boolean not null default true,
  keyword_filter text,
  platform_filter public.source_name,
  link_token uuid not null default gen_random_uuid(),
  link_token_expires_at timestamptz not null default (now() + interval '1 day'),
  connected_at timestamptz,
  paused_at timestamptz,
  last_alert_sent_at timestamptz,
  last_delivered_match_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_keyword_filter_len check (
    keyword_filter is null or char_length(btrim(keyword_filter)) between 2 and 120
  )
);

create unique index if not exists telegram_subscriptions_link_token_uq
  on public.telegram_subscriptions(link_token);

create index if not exists telegram_subscriptions_alerts_idx
  on public.telegram_subscriptions(alerts_enabled, last_alert_sent_at, last_error_at);

drop trigger if exists set_telegram_subscriptions_updated_at on public.telegram_subscriptions;
create trigger set_telegram_subscriptions_updated_at
before update on public.telegram_subscriptions
for each row execute function public.set_updated_at();

create or replace function public.fetch_telegram_mentions(
  p_user_id uuid,
  p_limit integer default 20,
  p_since timestamptz default null,
  p_keyword text default null,
  p_platform public.source_name default null
)
returns table (
  keyword_id uuid,
  matched_query text,
  matched_at timestamptz,
  platform public.source_name,
  external_id text,
  url text,
  title text,
  body_excerpt text,
  author text,
  community text,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requesting_user_id text := public.requesting_user_id();
  v_requesting_profile_id uuid := public.requesting_profile_id();
  v_role text := (select auth.role());
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_keyword text := nullif(lower(btrim(coalesce(p_keyword, ''))), '');
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if v_role <> 'service_role'
    and p_user_id is distinct from v_requesting_profile_id
    and p_user_id::text <> coalesce(v_requesting_user_id, '')
  then
    raise exception 'forbidden';
  end if;

  return query
  select
    mm.keyword_id,
    mm.matched_query,
    mm.matched_at,
    m.platform,
    m.external_id,
    m.url,
    m.title,
    m.body_excerpt,
    m.author,
    m.community,
    m.published_at
  from public.mention_matches mm
  join public.keywords k
    on k.id = mm.keyword_id
   and k.is_active
  join public.mentions m
    on m.id = mm.mention_id
  where mm.user_id = p_user_id
    and (p_since is null or mm.matched_at > p_since)
    and (v_keyword is null or lower(btrim(k.query)) = v_keyword)
    and (p_platform is null or m.platform = p_platform)
  order by mm.matched_at desc, m.published_at desc, mm.id desc
  limit v_limit;
end;
$$;

revoke all on function public.fetch_telegram_mentions(uuid, integer, timestamptz, text, public.source_name) from public, anon;
grant execute on function public.fetch_telegram_mentions(uuid, integer, timestamptz, text, public.source_name) to authenticated, service_role;

alter table public.telegram_subscriptions enable row level security;

drop policy if exists "telegram_subscriptions_owner_all" on public.telegram_subscriptions;
create policy "telegram_subscriptions_owner_all"
on public.telegram_subscriptions for all
using (
  user_id = (select auth.uid())
  or user_id = public.requesting_profile_id()
)
with check (
  user_id = (select auth.uid())
  or user_id = public.requesting_profile_id()
);
