-- Retire brand-based tracking. Keywords are now the single tracking primitive.

-- 1) Migrate existing brand names into keywords so users keep their monitoring terms.
insert into public.keywords (user_id, query, is_system, is_active)
select
  b.user_id,
  btrim(b.name) as query,
  false as is_system,
  b.is_active
from public.brands b
where char_length(btrim(b.name)) > 0
  and not exists (
    select 1
    from public.keywords k
    where k.user_id = b.user_id
      and lower(btrim(k.query)) = lower(btrim(b.name))
  );

-- If a matching keyword already exists but was inactive, reactivate it when brand was active.
update public.keywords k
set is_active = true,
    updated_at = now()
from public.brands b
where b.is_active
  and k.user_id = b.user_id
  and lower(btrim(k.query)) = lower(btrim(b.name))
  and not k.is_active;

-- System-keyword distinction is no longer needed.
update public.keywords
set is_system = false
where is_system = true;

-- Prevent duplicate active keywords per user/query before adding the new unique index.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, lower(btrim(query))
      order by created_at asc, id asc
    ) as rn
  from public.keywords
  where is_active = true
)
update public.keywords k
set is_active = false,
    updated_at = now()
from ranked r
where k.id = r.id
  and r.rn > 1;

-- 2) Remove brand automation and limits tied to brand table.
drop trigger if exists brand_system_keyword_insert on public.brands;
drop trigger if exists brand_system_keyword_update on public.brands;
drop trigger if exists brand_system_keyword_delete on public.brands;
drop trigger if exists set_brands_updated_at on public.brands;
drop trigger if exists enforce_brand_plan_limits on public.brands;

drop function if exists public.sync_brand_system_keyword();
drop function if exists public.delete_brand_system_keyword();

-- 3) Rebuild plan limit function for keyword-only limits.
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

-- 4) Drop brand columns and table dependencies.
drop policy if exists "brands_owner_all" on public.brands;

drop index if exists public.keywords_brand_id_idx;
drop index if exists public.mention_matches_brand_id_idx;
drop index if exists public.brands_user_name_lower_uq;
drop index if exists public.keywords_user_brand_query_lower_uq;

alter table public.mention_matches
  drop column if exists brand_id;

alter table public.keywords
  drop column if exists brand_id;

alter table public.plan_limits
  drop column if exists max_brands;

create unique index if not exists keywords_user_query_active_lower_uq
  on public.keywords(user_id, lower(btrim(query)))
  where is_active = true;

create index if not exists keywords_user_query_lower_idx
  on public.keywords(user_id, lower(btrim(query)));

drop table if exists public.brands;

-- 5) Recreate onboarding bootstrap RPC without brand columns.
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
