drop policy if exists "keyword_source_state_owner_insert" on public.keyword_source_state;

create policy "keyword_source_state_owner_insert"
on public.keyword_source_state for insert
with check (
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
