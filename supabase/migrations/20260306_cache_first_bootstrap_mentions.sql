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
  v_cache_cutoff timestamptz := now() - interval '24 hours';
  v_inserted integer := 0;
  v_nudged integer := 0;
  v_cache_hits integer := 0;
  v_cache_misses integer := 0;
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

  with active_pairs as (
    select
      k.id as keyword_id,
      k.user_id,
      k.query,
      lower(regexp_replace(btrim(k.query), '\s+', ' ', 'g')) as normalized_query,
      ks.source
    from public.keywords k
    join public.keyword_sources ks
      on ks.keyword_id = k.id
     and ks.enabled = true
    where k.user_id = p_user_id
      and k.is_active
      and char_length(btrim(k.query)) > 0
      and (
        p_sources is null
        or cardinality(p_sources) = 0
        or ks.source = any(p_sources)
      )
  ),
  candidate_matches as (
    select
      ap.user_id,
      ap.keyword_id,
      m.id as mention_id,
      ap.query as matched_query
    from active_pairs ap
    join public.mentions m
      on m.platform = ap.source
     and m.published_at >= v_cutoff
     and (
       lower(coalesce(m.title, '')) like '%' || replace(replace(replace(ap.normalized_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
       or lower(coalesce(m.body_excerpt, '')) like '%' || replace(replace(replace(ap.normalized_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
       or lower(coalesce(m.author, '')) like '%' || replace(replace(replace(ap.normalized_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
       or lower(coalesce(m.community, '')) like '%' || replace(replace(replace(ap.normalized_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
       or (ap.source = 'devto'::public.source_name and lower(coalesce(m.raw_payload::text, '')) like '%' || replace(replace(replace(ap.normalized_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\')
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

  with active_pairs as (
    select
      k.id as keyword_id,
      lower(regexp_replace(btrim(k.query), '\s+', ' ', 'g')) as normalized_query,
      ks.source
    from public.keywords k
    join public.keyword_sources ks
      on ks.keyword_id = k.id
     and ks.enabled = true
    where k.user_id = p_user_id
      and k.is_active
      and char_length(btrim(k.query)) > 0
      and (
        p_sources is null
        or cardinality(p_sources) = 0
        or ks.source = any(p_sources)
      )
  ),
  cache_eval as (
    select
      ap.keyword_id,
      ap.source,
      (sqc.last_fetched_at is not null and sqc.last_fetched_at >= v_cache_cutoff) as is_hit
    from active_pairs ap
    left join public.source_query_cache sqc
      on sqc.source = ap.source
     and sqc.normalized_query = ap.normalized_query
  )
  select
    count(*) filter (where cache_eval.is_hit),
    count(*) filter (where not cache_eval.is_hit)
  into v_cache_hits, v_cache_misses
  from cache_eval;

  with active_pairs as (
    select
      k.id as keyword_id,
      lower(regexp_replace(btrim(k.query), '\s+', ' ', 'g')) as normalized_query,
      ks.source
    from public.keywords k
    join public.keyword_sources ks
      on ks.keyword_id = k.id
     and ks.enabled = true
    where k.user_id = p_user_id
      and k.is_active
      and char_length(btrim(k.query)) > 0
      and (
        p_sources is null
        or cardinality(p_sources) = 0
        or ks.source = any(p_sources)
      )
  ),
  cache_eval as (
    select
      ap.keyword_id,
      ap.source,
      (sqc.last_fetched_at is not null and sqc.last_fetched_at >= v_cache_cutoff) as is_hit
    from active_pairs ap
    left join public.source_query_cache sqc
      on sqc.source = ap.source
     and sqc.normalized_query = ap.normalized_query
  )
  update public.keyword_source_state state
  set next_poll_at = now(),
      last_error = null,
      updated_at = now()
  from cache_eval ce
  where state.keyword_id = ce.keyword_id
    and state.source = ce.source
    and not ce.is_hit;

  get diagnostics v_nudged = row_count;

  return jsonb_build_object(
    'inserted_matches', v_inserted,
    'nudged_sources', v_nudged,
    'cache_hits', v_cache_hits,
    'cache_misses', v_cache_misses
  );
end;
$$;

revoke all on function public.bootstrap_mentions_for_user(uuid, public.source_name[], integer) from public, anon;
grant execute on function public.bootstrap_mentions_for_user(uuid, public.source_name[], integer) to authenticated, service_role;
