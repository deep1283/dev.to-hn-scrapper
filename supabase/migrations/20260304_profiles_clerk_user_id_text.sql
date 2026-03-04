-- Ensure Clerk subject IDs are stored as text (e.g. "user_abc123"), not uuid.
-- Some environments were created with profiles.clerk_user_id as uuid, which breaks Clerk auth lookups.

do $$
declare
  column_data_type text;
begin
  select c.data_type
    into column_data_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'profiles'
    and c.column_name = 'clerk_user_id';

  if column_data_type is null then
    alter table public.profiles add column clerk_user_id text;
  elsif column_data_type <> 'text' then
    drop index if exists public.profiles_clerk_user_id_uq;
    alter table public.profiles
      alter column clerk_user_id type text
      using clerk_user_id::text;
  end if;
end $$;

create unique index if not exists profiles_clerk_user_id_uq
  on public.profiles (clerk_user_id)
  where clerk_user_id is not null;
