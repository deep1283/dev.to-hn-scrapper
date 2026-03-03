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
      k.brand_id,
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
      ak.brand_id,
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
    insert into public.mention_matches (user_id, keyword_id, brand_id, mention_id, matched_query)
    select user_id, keyword_id, brand_id, mention_id, matched_query
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
