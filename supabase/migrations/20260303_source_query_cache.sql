create table if not exists public.source_query_cache (
  source public.source_name not null,
  normalized_query text not null,
  last_fetched_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (source, normalized_query)
);

create index if not exists source_query_cache_last_fetched_idx
  on public.source_query_cache(last_fetched_at desc);
