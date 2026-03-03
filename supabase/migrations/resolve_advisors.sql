-- Resolve Supabase Advisor findings for security + performance.
-- Safe to run multiple times.

-- 1) function_search_path_mutable
do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    execute 'alter function public.set_updated_at() set search_path = ''''''';
  end if;

  if to_regprocedure('public.enforce_plan_limits()') is not null then
    execute 'alter function public.enforce_plan_limits() set search_path = ''''''';
  end if;

  if to_regprocedure('public.seed_keyword_sources_and_state()') is not null then
    execute 'alter function public.seed_keyword_sources_and_state() set search_path = ''''''';
  end if;

  if to_regprocedure('public.sync_brand_system_keyword()') is not null then
    execute 'alter function public.sync_brand_system_keyword() set search_path = ''''''';
  end if;

  if to_regprocedure('public.delete_brand_system_keyword()') is not null then
    execute 'alter function public.delete_brand_system_keyword() set search_path = ''''''';
  end if;
end $$;

-- 2) rls_disabled_in_public
alter table public.plan_limits enable row level security;
drop policy if exists "plan_limits_select_authenticated" on public.plan_limits;
create policy "plan_limits_select_authenticated"
on public.plan_limits for select
using ((select auth.role()) in ('authenticated', 'service_role'));

alter table public.worker_runs enable row level security;
-- No worker_runs policies by design: deny-all for anon/authenticated.
-- service_role/bypassrls clients (worker) continue to function.

-- 3) unindexed_foreign_keys
create index if not exists alert_deliveries_keyword_id_idx on public.alert_deliveries(keyword_id);
create index if not exists alert_deliveries_mention_id_idx on public.alert_deliveries(mention_id);
create index if not exists mention_matches_keyword_id_idx on public.mention_matches(keyword_id);
create index if not exists mention_matches_mention_id_idx on public.mention_matches(mention_id);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'keywords'
      and column_name = 'brand_id'
  ) then
    execute 'create index if not exists keywords_brand_id_idx on public.keywords(brand_id)';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'mention_matches'
      and column_name = 'brand_id'
  ) then
    execute 'create index if not exists mention_matches_brand_id_idx on public.mention_matches(brand_id)';
  end if;
end $$;

-- 4) auth_rls_initplan (wrap auth.* in scalar subqueries)

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
with check ((select auth.uid()) = id);

do $$
begin
  if to_regclass('public.brands') is not null then
    execute 'drop policy if exists "brands_owner_all" on public.brands';
    execute 'create policy "brands_owner_all"
             on public.brands for all
             using ((select auth.uid()) = user_id)
             with check ((select auth.uid()) = user_id)';
  end if;
end $$;

drop policy if exists "keywords_owner_all" on public.keywords;
create policy "keywords_owner_all"
on public.keywords for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "keyword_sources_owner_all" on public.keyword_sources;
create policy "keyword_sources_owner_all"
on public.keyword_sources for all
using (
  exists (
    select 1
    from public.keywords k
    where k.id = keyword_sources.keyword_id
      and k.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.keywords k
    where k.id = keyword_sources.keyword_id
      and k.user_id = (select auth.uid())
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
      and mm.user_id = (select auth.uid())
  )
);

drop policy if exists "mention_matches_owner_all" on public.mention_matches;
create policy "mention_matches_owner_all"
on public.mention_matches for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "alert_deliveries_owner_select" on public.alert_deliveries;
create policy "alert_deliveries_owner_select"
on public.alert_deliveries for select
using ((select auth.uid()) = user_id);

-- Keep this table SELECT-only for end-users; worker/state mutations remain service-role only.
drop policy if exists "keyword_source_state_owner_select" on public.keyword_source_state;
drop policy if exists "keyword_source_state_owner_all" on public.keyword_source_state;
create policy "keyword_source_state_owner_select"
on public.keyword_source_state for select
using (
  exists (
    select 1
    from public.keywords k
    where k.id = keyword_source_state.keyword_id
      and k.user_id = (select auth.uid())
  )
);

drop policy if exists "webhook_events_service_role_only" on public.webhook_events;
create policy "webhook_events_service_role_only"
on public.webhook_events for all
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

drop policy if exists "api_rate_limits_service_role_only" on public.api_rate_limits;
create policy "api_rate_limits_service_role_only"
on public.api_rate_limits for all
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

-- Manual post-migration action (Supabase Dashboard):
-- Auth -> Password Security -> enable leaked password protection.
