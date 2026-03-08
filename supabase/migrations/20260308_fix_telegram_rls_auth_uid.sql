-- Fix RLS policy crashing on Clerk user IDs because auth.uid() casts to UUID

drop policy if exists "telegram_subscriptions_owner_all" on public.telegram_subscriptions;

create policy "telegram_subscriptions_owner_all"
on public.telegram_subscriptions for all
using (user_id = public.requesting_profile_id())
with check (user_id = public.requesting_profile_id());
