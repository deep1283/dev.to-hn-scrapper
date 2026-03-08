alter table public.telegram_subscriptions
  add column if not exists pending_action text;

alter table public.telegram_subscriptions
  drop constraint if exists telegram_pending_action_check;

alter table public.telegram_subscriptions
  add constraint telegram_pending_action_check
  check (
    pending_action is null
    or pending_action in ('keyword_query', 'platform_query', 'set_keyword', 'set_platform')
  );
