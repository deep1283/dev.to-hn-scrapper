-- Clerk subjects are text IDs (e.g. "user_xxx"), while Supabase auth subjects are UUIDs.
-- `auth.uid()` can throw when `sub` is not a UUID, so RLS policies must use a safe UUID extractor.

create or replace function public.requesting_auth_uid()
returns uuid
language sql
stable
as $$
  select case
    when nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then ((current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid)
    else null
  end
$$;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
using (
  public.requesting_auth_uid() = id
  or clerk_user_id = public.requesting_user_id()
);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using (
  public.requesting_auth_uid() = id
  or clerk_user_id = public.requesting_user_id()
)
with check (
  public.requesting_auth_uid() = id
  or clerk_user_id = public.requesting_user_id()
);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
with check (
  (public.requesting_auth_uid() = id and clerk_user_id is null)
  or clerk_user_id = public.requesting_user_id()
);

do $$
begin
  if to_regclass('public.brands') is not null then
    execute 'drop policy if exists "brands_owner_all" on public.brands';
    execute 'create policy "brands_owner_all"
             on public.brands for all
             using (
               user_id = public.requesting_auth_uid()
               or user_id = public.requesting_profile_id()
             )
             with check (
               user_id = public.requesting_auth_uid()
               or user_id = public.requesting_profile_id()
             )';
  end if;
end $$;

drop policy if exists "keywords_owner_all" on public.keywords;
create policy "keywords_owner_all"
on public.keywords for all
using (
  user_id = public.requesting_auth_uid()
  or user_id = public.requesting_profile_id()
)
with check (
  user_id = public.requesting_auth_uid()
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
        k.user_id = public.requesting_auth_uid()
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
        k.user_id = public.requesting_auth_uid()
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
        mm.user_id = public.requesting_auth_uid()
        or mm.user_id = public.requesting_profile_id()
      )
  )
);

drop policy if exists "mention_matches_owner_all" on public.mention_matches;
create policy "mention_matches_owner_all"
on public.mention_matches for all
using (
  user_id = public.requesting_auth_uid()
  or user_id = public.requesting_profile_id()
)
with check (
  user_id = public.requesting_auth_uid()
  or user_id = public.requesting_profile_id()
);

drop policy if exists "alert_deliveries_owner_select" on public.alert_deliveries;
create policy "alert_deliveries_owner_select"
on public.alert_deliveries for select
using (
  user_id = public.requesting_auth_uid()
  or user_id = public.requesting_profile_id()
);

drop policy if exists "keyword_source_state_owner_all" on public.keyword_source_state;
drop policy if exists "keyword_source_state_owner_select" on public.keyword_source_state;
create policy "keyword_source_state_owner_select"
on public.keyword_source_state for select
using (
  exists (
    select 1
    from public.keywords k
    where k.id = keyword_source_state.keyword_id
      and (
        k.user_id = public.requesting_auth_uid()
        or k.user_id = public.requesting_profile_id()
      )
  )
);
