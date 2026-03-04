create table if not exists public.pilot_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  app_url text not null,
  testing_scope text not null,
  created_at timestamptz not null default now(),
  constraint pilot_requests_name_len check (char_length(btrim(name)) between 1 and 120),
  constraint pilot_requests_email_len check (char_length(btrim(email)) between 3 and 320),
  constraint pilot_requests_app_url_len check (char_length(btrim(app_url)) between 8 and 500),
  constraint pilot_requests_scope_len check (char_length(btrim(testing_scope)) between 10 and 2000)
);

create index if not exists pilot_requests_created_at_idx
  on public.pilot_requests (created_at desc);

alter table public.pilot_requests enable row level security;

drop policy if exists "pilot_requests_service_role_only" on public.pilot_requests;
create policy "pilot_requests_service_role_only"
on public.pilot_requests for all
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');
