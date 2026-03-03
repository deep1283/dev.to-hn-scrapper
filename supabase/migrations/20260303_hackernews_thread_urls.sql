update public.mentions
set url = 'https://news.ycombinator.com/item?id=' || external_id
where platform = 'hackernews'
  and coalesce(external_id, '') <> '';
