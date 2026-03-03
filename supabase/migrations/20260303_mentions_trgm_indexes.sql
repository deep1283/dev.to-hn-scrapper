create extension if not exists pg_trgm;

create index if not exists mentions_title_trgm_idx
  on public.mentions using gin (lower(coalesce(title, '')) gin_trgm_ops);

create index if not exists mentions_body_excerpt_trgm_idx
  on public.mentions using gin (lower(coalesce(body_excerpt, '')) gin_trgm_ops);

create index if not exists mentions_author_trgm_idx
  on public.mentions using gin (lower(coalesce(author, '')) gin_trgm_ops);

create index if not exists mentions_community_trgm_idx
  on public.mentions using gin (lower(coalesce(community, '')) gin_trgm_ops);
