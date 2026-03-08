create index if not exists mention_matches_user_keyword_time_idx
  on public.mention_matches(user_id, keyword_id, matched_at desc);

create or replace function public.fetch_dashboard_mention_candidates(
  p_user_id uuid,
  p_platforms public.source_name[] default array['hackernews', 'devto', 'github_discussions']::public.source_name[],
  p_history_days integer default 7,
  p_per_keyword_limit integer default 100
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
  v_history_days integer := greatest(coalesce(p_history_days, 7), 1);
  v_per_keyword_limit integer := greatest(coalesce(p_per_keyword_limit, 100), 1);
  v_cutoff timestamptz := (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') - make_interval(days => v_history_days);
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
  with active_keywords as (
    select k.id as keyword_id
    from public.keywords k
    where k.user_id = p_user_id
      and k.is_active
  ),
  ranked_matches as (
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
      m.published_at,
      row_number() over (
        partition by m.platform, mm.keyword_id
        order by mm.matched_at desc, m.published_at desc, mm.id desc
      ) as keyword_rank
    from public.mention_matches mm
    join active_keywords ak
      on ak.keyword_id = mm.keyword_id
    join public.mentions m
      on m.id = mm.mention_id
    where mm.user_id = p_user_id
      and m.published_at >= v_cutoff
      and (
        p_platforms is null
        or cardinality(p_platforms) = 0
        or m.platform = any(p_platforms)
      )
  )
  select
    rm.keyword_id,
    rm.matched_query,
    rm.matched_at,
    rm.platform,
    rm.external_id,
    rm.url,
    rm.title,
    rm.body_excerpt,
    rm.author,
    rm.community,
    rm.published_at
  from ranked_matches rm
  where rm.keyword_rank <= v_per_keyword_limit
  order by rm.matched_at desc, rm.published_at desc;
end;
$$;

revoke all on function public.fetch_dashboard_mention_candidates(uuid, public.source_name[], integer, integer) from public, anon;
grant execute on function public.fetch_dashboard_mention_candidates(uuid, public.source_name[], integer, integer) to authenticated, service_role;
