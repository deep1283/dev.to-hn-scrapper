-- Add support for Clerk-authenticated users while keeping existing Supabase Auth users working.

-- Profiles are now app-owned identities, not strictly tied to auth.users.
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles add column if not exists clerk_user_id text;
create unique index if not exists profiles_clerk_user_id_uq
  on public.profiles(clerk_user_id)
  where clerk_user_id is not null;

-- Resolve authenticated subject from request JWT claims.
create or replace function public.requesting_user_id()
returns text
language sql
stable
as $$
  select nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')
$$;

-- Map Clerk subject -> internal profile UUID.
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

-- Update ownership policies to support either:
-- 1) legacy Supabase auth.uid() ownership
-- 2) Clerk subject mapped via profiles.clerk_user_id

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

do $$
begin
  if to_regclass('public.brands') is not null then
    execute 'drop policy if exists "brands_owner_all" on public.brands';
    execute 'create policy "brands_owner_all"
             on public.brands for all
             using (
               user_id = (select auth.uid())
               or user_id = public.requesting_profile_id()
             )
             with check (
               user_id = (select auth.uid())
               or user_id = public.requesting_profile_id()
             )';
  end if;
end $$;

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
