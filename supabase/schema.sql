-- Mention Tracker core schema
-- Apply this in Supabase SQL editor or via migrations.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create type public.plan_tier as enum ('starter_9', 'growth_15');
create type public.source_name as enum (
  'reddit',
  'hackernews',
  'devto',
  'google',
  'brave',
  'github_discussions',
  'producthunt'
);
create type public.alert_status as enum ('pending', 'sent', 'failed', 'dead_letter');

alter type public.source_name add value if not exists 'producthunt';

create table if not exists public.plan_limits (
  plan_tier public.plan_tier primary key,
  max_keywords integer not null check (max_keywords > 0),
  updated_at timestamptz not null default now()
);

insert into public.plan_limits (plan_tier, max_keywords)
values
  ('starter_9', 7),
  ('growth_15', 35)
on conflict (plan_tier) do update
set max_keywords = excluded.max_keywords,
    updated_at = now();

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text,
  clerk_user_id text,
  plan_tier public.plan_tier not null default 'starter_9',
  billing_mode text check (billing_mode in ('trial', 'paid')),
  plan_selected_at timestamptz,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  onboarding_completed boolean not null default false,
  slack_webhook_url_enc text,
  timezone text not null default 'UTC',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists billing_mode text;
alter table public.profiles add column if not exists plan_selected_at timestamptz;
alter table public.profiles add column if not exists trial_started_at timestamptz;
alter table public.profiles add column if not exists trial_ends_at timestamptz;
alter table public.profiles add column if not exists clerk_user_id text;
alter table public.profiles add column if not exists pending_plan_tier public.plan_tier;
alter table public.profiles add column if not exists pending_plan_effective_at timestamptz;
alter table public.profiles add column if not exists onboarding_completed boolean not null default false;
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles drop constraint if exists profiles_billing_mode_check;
alter table public.profiles add constraint profiles_billing_mode_check check (billing_mode in ('trial', 'paid'));
create unique index if not exists profiles_clerk_user_id_uq
  on public.profiles(clerk_user_id)
  where clerk_user_id is not null;



create table if not exists public.keywords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  query text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint keyword_query_len check (char_length(btrim(query)) between 2 and 120)
);

create unique index if not exists keywords_user_query_active_lower_uq
  on public.keywords(user_id, lower(btrim(query)))
  where is_active = true;

create index if not exists keywords_user_query_lower_idx
  on public.keywords(user_id, lower(btrim(query)));

create table if not exists public.keyword_sources (
  keyword_id uuid not null references public.keywords(id) on delete cascade,
  source public.source_name not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (keyword_id, source)
);

create table if not exists public.mentions (
  id bigint generated always as identity primary key,
  platform public.source_name not null,
  external_id text not null,
  url text not null,
  title text,
  body_excerpt text,
  author text,
  community text,
  published_at timestamptz not null,
  raw_payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (platform, external_id)
);

create index if not exists mentions_platform_published_idx
  on public.mentions(platform, published_at desc);

create index if not exists mentions_title_trgm_idx
  on public.mentions using gin (lower(coalesce(title, '')) gin_trgm_ops);

create index if not exists mentions_body_excerpt_trgm_idx
  on public.mentions using gin (lower(coalesce(body_excerpt, '')) gin_trgm_ops);

create index if not exists mentions_author_trgm_idx
  on public.mentions using gin (lower(coalesce(author, '')) gin_trgm_ops);

create index if not exists mentions_community_trgm_idx
  on public.mentions using gin (lower(coalesce(community, '')) gin_trgm_ops);

create table if not exists public.mention_matches (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  keyword_id uuid not null references public.keywords(id) on delete cascade,
  mention_id bigint not null references public.mentions(id) on delete cascade,
  matched_query text not null,
  matched_at timestamptz not null default now(),
  unique (user_id, mention_id, keyword_id)
);

create index if not exists mention_matches_user_time_idx
  on public.mention_matches(user_id, matched_at desc);



create index if not exists mention_matches_keyword_id_idx
  on public.mention_matches(keyword_id);

create index if not exists mention_matches_mention_id_idx
  on public.mention_matches(mention_id);

create table if not exists public.alert_deliveries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mention_id bigint not null references public.mentions(id) on delete cascade,
  keyword_id uuid not null references public.keywords(id) on delete cascade,
  channel text not null default 'slack_webhook',
  status public.alert_status not null default 'pending',
  retry_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mention_id, keyword_id, channel)
);

create index if not exists alert_deliveries_pending_idx
  on public.alert_deliveries(status, next_attempt_at)
  where status in ('pending', 'failed');

create index if not exists alert_deliveries_keyword_id_idx
  on public.alert_deliveries(keyword_id);

create index if not exists alert_deliveries_mention_id_idx
  on public.alert_deliveries(mention_id);

create table if not exists public.keyword_source_state (
  keyword_id uuid not null references public.keywords(id) on delete cascade,
  source public.source_name not null,
  last_checked_at timestamptz,
  cursor text,
  next_poll_at timestamptz not null default now(),
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (keyword_id, source)
);

create index if not exists keyword_source_state_next_poll_idx
  on public.keyword_source_state(next_poll_at);

create table if not exists public.source_query_cache (
  source public.source_name not null,
  normalized_query text not null,
  last_fetched_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (source, normalized_query)
);

create index if not exists source_query_cache_last_fetched_idx
  on public.source_query_cache(last_fetched_at desc);

create table if not exists public.worker_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'success', 'failed')),
  stats jsonb not null default '{}'::jsonb,
  error text
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

create index if not exists webhook_events_received_at_idx
  on public.webhook_events(received_at desc);

create table if not exists public.pilot_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  app_url text not null,
  testing_scope text not null,
  created_at timestamptz not null default now(),
  constraint pilot_requests_name_len check (char_length(btrim(name)) between 1 and 120),
  constraint pilot_requests_email_len check (char_length(btrim(email)) between 3 and 320),
  constraint pilot_requests_app_url_len check (char_length(btrim(app_url)) between 8 and 500),
  constraint pilot_requests_scope_len check (char_length(btrim(testing_scope)) between 10 and 2000)
);

create index if not exists pilot_requests_created_at_idx
  on public.pilot_requests(created_at desc);

create table if not exists public.api_rate_limits (
  bucket text primary key,
  count integer not null,
  window_started_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists api_rate_limits_window_started_idx
  on public.api_rate_limits(window_started_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.take_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  current_count integer;
  window_start timestamptz;
  window_secs integer := greatest(p_window_seconds, 1);
  effective_limit integer := greatest(p_limit, 1);
  reset_at timestamptz;
begin
  if p_bucket is null or btrim(p_bucket) = '' then
    raise exception 'Rate limit bucket cannot be empty';
  end if;

  insert into public.api_rate_limits as arl (bucket, count, window_started_at, updated_at)
  values (p_bucket, 1, now_ts, now_ts)
  on conflict (bucket)
  do update set
    count = case
      when arl.window_started_at + make_interval(secs => window_secs) <= now_ts then 1
      else arl.count + 1
    end,
    window_started_at = case
      when arl.window_started_at + make_interval(secs => window_secs) <= now_ts then now_ts
      else arl.window_started_at
    end,
    updated_at = now_ts;

  select count, window_started_at
    into current_count, window_start
  from public.api_rate_limits
  where bucket = p_bucket;

  reset_at := window_start + make_interval(secs => window_secs);

  if current_count > effective_limit then
    return query
      select
        false,
        0,
        greatest(ceil(extract(epoch from (reset_at - now_ts)))::integer, 1);
  else
    return query
      select
        true,
        greatest(effective_limit - current_count, 0),
        greatest(ceil(extract(epoch from (reset_at - now_ts)))::integer, 1);
  end if;
end;
$$;

revoke all on function public.take_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.take_rate_limit(text, integer, integer) to service_role;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();



drop trigger if exists set_keywords_updated_at on public.keywords;
create trigger set_keywords_updated_at
before update on public.keywords
for each row execute function public.set_updated_at();

drop trigger if exists set_keyword_sources_updated_at on public.keyword_sources;
create trigger set_keyword_sources_updated_at
before update on public.keyword_sources
for each row execute function public.set_updated_at();

drop trigger if exists set_alert_deliveries_updated_at on public.alert_deliveries;
create trigger set_alert_deliveries_updated_at
before update on public.alert_deliveries
for each row execute function public.set_updated_at();

drop trigger if exists set_keyword_source_state_updated_at on public.keyword_source_state;
create trigger set_keyword_source_state_updated_at
before update on public.keyword_source_state
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- sync auth.users -> profiles
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.enforce_plan_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tier public.plan_tier;
  allowed_keywords integer;
  keyword_count integer;
begin
  select p.plan_tier, l.max_keywords
    into tier, allowed_keywords
  from public.profiles p
  join public.plan_limits l on l.plan_tier = p.plan_tier
  where p.id = new.user_id;

  if tier is null then
    raise exception 'Profile not found for user_id=%', new.user_id;
  end if;

  if new.is_active then
    select count(*) into keyword_count
    from public.keywords k
    where k.user_id = new.user_id
      and k.is_active
      and (tg_op = 'INSERT' or k.id <> new.id);

    if keyword_count >= allowed_keywords then
      raise exception 'Plan % allows at most % active keyword(s). Upgrade required.', tier, allowed_keywords;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_keyword_plan_limits on public.keywords;
create trigger enforce_keyword_plan_limits
before insert or update of user_id, is_active on public.keywords
for each row execute function public.enforce_plan_limits();

create or replace function public.seed_keyword_sources_and_state()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  src public.source_name;
  v1_enabled boolean;
begin
  for src in
    select unnest(enum_range(null::public.source_name))
  loop
    v1_enabled := src in ('hackernews'::public.source_name, 'devto'::public.source_name, 'github_discussions'::public.source_name);

    insert into public.keyword_sources (keyword_id, source, enabled)
    values (new.id, src, v1_enabled)
    on conflict (keyword_id, source) do nothing;

    insert into public.keyword_source_state (keyword_id, source, next_poll_at)
    values (new.id, src, now())
    on conflict (keyword_id, source) do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists seed_keyword_source_defaults on public.keywords;
create trigger seed_keyword_source_defaults
after insert on public.keywords
for each row execute function public.seed_keyword_sources_and_state();



create or replace function public.requesting_user_id()
returns text
language sql
stable
as $$
  select nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')
$$;

create or replace function public.requesting_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where p.clerk_user_id = public.requesting_user_id()
  limit 1
$$;

revoke all on function public.requesting_profile_id() from public, anon;
grant execute on function public.requesting_profile_id() to authenticated, service_role;

create or replace function public.bootstrap_mentions_for_user(
  p_user_id uuid,
  p_sources public.source_name[] default array['hackernews', 'devto', 'github_discussions']::public.source_name[],
  p_history_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requesting_user_id text := public.requesting_user_id();
  v_requesting_profile_id uuid := public.requesting_profile_id();
  v_role text := (select auth.role());
  v_history_days integer := greatest(coalesce(p_history_days, 7), 1);
  v_cutoff timestamptz := (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') - make_interval(days => v_history_days);
  v_inserted integer := 0;
  v_nudged integer := 0;
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

  update public.keyword_source_state state
  set next_poll_at = now(),
      last_error = null,
      updated_at = now()
  from public.keywords k
  where state.keyword_id = k.id
    and k.user_id = p_user_id
    and k.is_active
    and (
      p_sources is null
      or cardinality(p_sources) = 0
      or state.source = any(p_sources)
    );

  get diagnostics v_nudged = row_count;

  with active_keywords as (
    select
      k.id as keyword_id,
      k.user_id,
      k.query,
      lower(regexp_replace(btrim(k.query), '\s+', ' ', 'g')) as normalized_query
    from public.keywords k
    where k.user_id = p_user_id
      and k.is_active
      and char_length(btrim(k.query)) > 0
  ),
  candidate_matches as (
    select
      ak.user_id,
      ak.keyword_id,
      m.id as mention_id,
      ak.query as matched_query
    from active_keywords ak
    join public.mentions m
      on m.published_at >= v_cutoff
     and (
       p_sources is null
       or cardinality(p_sources) = 0
       or m.platform = any(p_sources)
     )
     and (
       lower(coalesce(m.title, '')) like '%' || replace(replace(replace(ak.normalized_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
       or lower(coalesce(m.body_excerpt, '')) like '%' || replace(replace(replace(ak.normalized_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
       or lower(coalesce(m.author, '')) like '%' || replace(replace(replace(ak.normalized_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
       or lower(coalesce(m.community, '')) like '%' || replace(replace(replace(ak.normalized_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
     )
  ),
  inserted as (
    insert into public.mention_matches (user_id, keyword_id, mention_id, matched_query)
    select user_id, keyword_id, mention_id, matched_query
    from candidate_matches
    on conflict (user_id, mention_id, keyword_id) do nothing
    returning 1
  )
  select count(*) into v_inserted
  from inserted;

  return jsonb_build_object(
    'inserted_matches', v_inserted,
    'nudged_sources', v_nudged
  );
end;
$$;

revoke all on function public.bootstrap_mentions_for_user(uuid, public.source_name[], integer) from public, anon;
grant execute on function public.bootstrap_mentions_for_user(uuid, public.source_name[], integer) to authenticated, service_role;



alter table public.plan_limits enable row level security;
alter table public.profiles enable row level security;
alter table public.keywords enable row level security;
alter table public.keyword_sources enable row level security;
alter table public.mentions enable row level security;
alter table public.mention_matches enable row level security;
alter table public.alert_deliveries enable row level security;
alter table public.keyword_source_state enable row level security;
alter table public.worker_runs enable row level security;
alter table public.webhook_events enable row level security;
alter table public.pilot_requests enable row level security;
alter table public.api_rate_limits enable row level security;

drop policy if exists "plan_limits_select_authenticated" on public.plan_limits;
create policy "plan_limits_select_authenticated"
on public.plan_limits for select
using ((select auth.role()) in ('authenticated', 'service_role'));

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
using (
  (select auth.uid()) = id
  or clerk_user_id = public.requesting_user_id()
);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using (
  (select auth.uid()) = id
  or clerk_user_id = public.requesting_user_id()
)
with check (
  (select auth.uid()) = id
  or clerk_user_id = public.requesting_user_id()
);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
with check (
  ((select auth.uid()) = id and clerk_user_id is null)
  or clerk_user_id = public.requesting_user_id()
);



drop policy if exists "keywords_owner_all" on public.keywords;
create policy "keywords_owner_all"
on public.keywords for all
using (
  user_id = (select auth.uid())
  or user_id = public.requesting_profile_id()
)
with check (
  user_id = (select auth.uid())
  or user_id = public.requesting_profile_id()
);

drop policy if exists "keyword_sources_owner_all" on public.keyword_sources;
create policy "keyword_sources_owner_all"
on public.keyword_sources for all
using (
  exists (
    select 1
    from public.keywords k
    where k.id = keyword_sources.keyword_id
      and (
        k.user_id = (select auth.uid())
        or k.user_id = public.requesting_profile_id()
      )
  )
)
with check (
  exists (
    select 1
    from public.keywords k
    where k.id = keyword_sources.keyword_id
      and (
        k.user_id = (select auth.uid())
        or k.user_id = public.requesting_profile_id()
      )
  )
);

drop policy if exists "mentions_select_for_owner" on public.mentions;
create policy "mentions_select_for_owner"
on public.mentions for select
using (
  exists (
    select 1
    from public.mention_matches mm
    where mm.mention_id = mentions.id
      and (
        mm.user_id = (select auth.uid())
        or mm.user_id = public.requesting_profile_id()
      )
  )
);

drop policy if exists "mention_matches_owner_all" on public.mention_matches;
create policy "mention_matches_owner_all"
on public.mention_matches for all
using (
  user_id = (select auth.uid())
  or user_id = public.requesting_profile_id()
)
with check (
  user_id = (select auth.uid())
  or user_id = public.requesting_profile_id()
);

drop policy if exists "alert_deliveries_owner_select" on public.alert_deliveries;
create policy "alert_deliveries_owner_select"
on public.alert_deliveries for select
using (
  user_id = (select auth.uid())
  or user_id = public.requesting_profile_id()
);

drop policy if exists "keyword_source_state_owner_select" on public.keyword_source_state;
drop policy if exists "keyword_source_state_owner_all" on public.keyword_source_state;
create policy "keyword_source_state_owner_select"
on public.keyword_source_state for select
using (
  exists (
    select 1
    from public.keywords k
    where k.id = keyword_source_state.keyword_id
      and (
        k.user_id = (select auth.uid())
        or k.user_id = public.requesting_profile_id()
      )
  )
);

drop policy if exists "webhook_events_service_role_only" on public.webhook_events;
create policy "webhook_events_service_role_only"
on public.webhook_events for all
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

drop policy if exists "pilot_requests_service_role_only" on public.pilot_requests;
create policy "pilot_requests_service_role_only"
on public.pilot_requests for all
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

drop policy if exists "api_rate_limits_service_role_only" on public.api_rate_limits;
create policy "api_rate_limits_service_role_only"
on public.api_rate_limits for all
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

