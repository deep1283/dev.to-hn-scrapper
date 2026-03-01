-- Adds support for scheduled downgrades that apply at the next billing cycle.

alter table public.profiles
  add column if not exists pending_plan_tier public.plan_tier,
  add column if not exists pending_plan_effective_at timestamptz;
