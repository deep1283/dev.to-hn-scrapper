-- 1. Redefine requesting_profile_id() to safely map the JWT sub to a profile ID
-- without crashing on non-UUID strings (like Clerk's user_xxx).
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
     or (p.clerk_user_id is null and p.id::text = public.requesting_user_id())
  limit 1
$$;

-- 2. Drop and recreate all policies that use auth.uid() directly

---- profiles ----
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
using (
  (id::text = public.requesting_user_id() and clerk_user_id is null)
  or clerk_user_id = public.requesting_user_id()
);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using (
  (id::text = public.requesting_user_id() and clerk_user_id is null)
  or clerk_user_id = public.requesting_user_id()
)
with check (
  (id::text = public.requesting_user_id() and clerk_user_id is null)
  or clerk_user_id = public.requesting_user_id()
);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
with check (
  (id::text = public.requesting_user_id() and clerk_user_id is null)
  or clerk_user_id = public.requesting_user_id()
);

---- keywords ----
drop policy if exists "keywords_owner_all" on public.keywords;
create policy "keywords_owner_all"
on public.keywords for all
using (user_id = public.requesting_profile_id())
with check (user_id = public.requesting_profile_id());

---- keyword_sources ----
drop policy if exists "keyword_sources_owner_all" on public.keyword_sources;
create policy "keyword_sources_owner_all"
on public.keyword_sources for all
using (
  exists (
    select 1
    from public.keywords k
    where k.id = keyword_sources.keyword_id
      and k.user_id = public.requesting_profile_id()
  )
)
with check (
  exists (
    select 1
    from public.keywords k
    where k.id = keyword_sources.keyword_id
      and k.user_id = public.requesting_profile_id()
  )
);

---- mentions ----
drop policy if exists "mentions_select_for_owner" on public.mentions;
create policy "mentions_select_for_owner"
on public.mentions for select
using (
  exists (
    select 1
    from public.mention_matches mm
    where mm.mention_id = mentions.id
      and mm.user_id = public.requesting_profile_id()
  )
);

---- mention_matches ----
drop policy if exists "mention_matches_owner_all" on public.mention_matches;
create policy "mention_matches_owner_all"
on public.mention_matches for all
using (user_id = public.requesting_profile_id())
with check (user_id = public.requesting_profile_id());

---- alert_deliveries ----
drop policy if exists "alert_deliveries_owner_select" on public.alert_deliveries;
create policy "alert_deliveries_owner_select"
on public.alert_deliveries for select
using (user_id = public.requesting_profile_id());

---- keyword_source_state ----
drop policy if exists "keyword_source_state_owner_select" on public.keyword_source_state;
create policy "keyword_source_state_owner_select"
on public.keyword_source_state for select
using (
  exists (
    select 1
    from public.keywords k
    where k.id = keyword_source_state.keyword_id
      and k.user_id = public.requesting_profile_id()
  )
);

drop policy if exists "keyword_source_state_owner_insert" on public.keyword_source_state;
create policy "keyword_source_state_owner_insert"
on public.keyword_source_state for insert
with check (
  exists (
    select 1
    from public.keywords k
    where k.id = keyword_source_state.keyword_id
      and k.user_id = public.requesting_profile_id()
  )
);
