from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator
from uuid import UUID

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from mention_worker.models import MentionCandidate, MentionRecord, PendingAlert, QueryCacheEntry, SourceTask


class Database:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    @contextmanager
    def connection(self) -> Iterator[psycopg.Connection[Any]]:
        conn = psycopg.connect(self._dsn, row_factory=dict_row)
        try:
            yield conn
        finally:
            conn.close()

    @staticmethod
    def ensure_runtime_schema(conn: psycopg.Connection[Any]) -> None:
        with conn.cursor() as cur:
            cur.execute(
                """
                create table if not exists public.source_query_cache (
                  source public.source_name not null,
                  normalized_query text not null,
                  last_fetched_at timestamptz not null,
                  updated_at timestamptz not null default now(),
                  primary key (source, normalized_query)
                )
                """
            )
            cur.execute(
                """
                create index if not exists source_query_cache_last_fetched_idx
                  on public.source_query_cache(last_fetched_at desc)
                """
            )
        conn.commit()

    @staticmethod
    def try_advisory_lock(conn: psycopg.Connection[Any], lock_key: int) -> bool:
        with conn.cursor() as cur:
            cur.execute("select pg_try_advisory_lock(%s) as locked", (lock_key,))
            row = cur.fetchone()
        return bool(row and row["locked"])

    @staticmethod
    def try_query_advisory_lock(
        conn: psycopg.Connection[Any],
        *,
        source: str,
        normalized_query: str,
    ) -> bool:
        lock_key = f"{source}:{normalized_query}"
        with conn.cursor() as cur:
            cur.execute(
                "select pg_try_advisory_lock(hashtextextended(%s, 0)) as locked",
                (lock_key,),
            )
            row = cur.fetchone()
        return bool(row and row["locked"])

    @staticmethod
    def release_query_advisory_lock(
        conn: psycopg.Connection[Any],
        *,
        source: str,
        normalized_query: str,
    ) -> None:
        lock_key = f"{source}:{normalized_query}"
        with conn.cursor() as cur:
            cur.execute(
                "select pg_advisory_unlock(hashtextextended(%s, 0))",
                (lock_key,),
            )

    @staticmethod
    def create_worker_run(conn: psycopg.Connection[Any]) -> UUID:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into public.worker_runs (status)
                values ('running')
                returning id
                """
            )
            row = cur.fetchone()
        conn.commit()
        return row["id"]

    @staticmethod
    def finish_worker_run(
        conn: psycopg.Connection[Any],
        *,
        run_id: UUID,
        status: str,
        stats: dict[str, Any],
        error: str | None = None,
    ) -> None:
        with conn.cursor() as cur:
            cur.execute(
                """
                update public.worker_runs
                set status = %s,
                    stats = %s,
                    error = %s,
                    finished_at = now()
                where id = %s
                """,
                (status, Jsonb(stats), error, run_id),
            )
        conn.commit()

    @staticmethod
    def fetch_today_source_requests(
        conn: psycopg.Connection[Any],
        *,
        source_keys: tuple[str, ...],
    ) -> dict[str, int]:
        totals: dict[str, int] = {key: 0 for key in source_keys}
        if not source_keys:
            return totals

        with conn.cursor() as cur:
            cur.execute(
                """
                select
                  stats->'source_requests' as source_requests
                from public.worker_runs
                where started_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')
                """
            )
            rows = cur.fetchall() or []

        for row in rows:
            source_requests = row.get("source_requests")
            if not isinstance(source_requests, dict):
                continue
            for key in source_keys:
                raw_value = source_requests.get(key)
                if raw_value is None:
                    continue
                try:
                    totals[key] += int(raw_value)
                except (TypeError, ValueError):
                    continue

        return totals

    @staticmethod
    def fetch_due_source_tasks(
        conn: psycopg.Connection[Any],
        *,
        batch_size: int,
        enabled_sources: tuple[str, ...],
    ) -> list[SourceTask]:
        if not enabled_sources:
            return []

        with conn.cursor() as cur:
            cur.execute(
                """
                select
                  ks.keyword_id,
                  k.user_id,
                  p.plan_tier::text as plan_tier,
                  k.query,
                  ks.source::text as source,
                  st.last_checked_at
                from public.keyword_sources ks
                join public.keywords k on k.id = ks.keyword_id
                join public.profiles p on p.id = k.user_id
                left join public.keyword_source_state st
                  on st.keyword_id = ks.keyword_id
                 and st.source = ks.source
                where ks.enabled = true
                  and k.is_active = true
                  and p.is_active = true
                  and ks.source::text = any(%s)
                  and coalesce(st.next_poll_at, now()) <= now()
                order by coalesce(st.next_poll_at, now()) asc
                limit %s
                """,
                (list(enabled_sources), batch_size),
            )
            rows = cur.fetchall()

        tasks: list[SourceTask] = []
        for row in rows:
            tasks.append(
                SourceTask(
                    keyword_id=row["keyword_id"],
                    user_id=row["user_id"],
                    plan_tier=row["plan_tier"],
                    query=row["query"],
                    source=row["source"],
                    last_checked_at=row["last_checked_at"],
                )
            )
        return tasks

    @staticmethod
    def fetch_query_cache_entries(
        conn: psycopg.Connection[Any],
        *,
        keys: list[tuple[str, str]],
    ) -> dict[tuple[str, str], QueryCacheEntry]:
        if not keys:
            return {}

        with conn.cursor() as cur:
            cur.execute(
                """
                select source::text as source, normalized_query, last_fetched_at
                from public.source_query_cache
                where (source::text, normalized_query) in (
                  select source, normalized_query
                  from unnest(%s::text[], %s::text[]) as t(source, normalized_query)
                )
                """,
                ([source for source, _ in keys], [query for _, query in keys]),
            )
            rows = cur.fetchall() or []

        entries: dict[tuple[str, str], QueryCacheEntry] = {}
        for row in rows:
            entry = QueryCacheEntry(
                source=row["source"],
                normalized_query=row["normalized_query"],
                last_fetched_at=row["last_fetched_at"],
            )
            entries[(entry.source, entry.normalized_query)] = entry
        return entries

    @staticmethod
    def upsert_query_cache_entry(
        conn: psycopg.Connection[Any],
        *,
        source: str,
        normalized_query: str,
        fetched_at: datetime,
    ) -> None:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into public.source_query_cache (source, normalized_query, last_fetched_at, updated_at)
                values (%s, %s, %s, now())
                on conflict (source, normalized_query) do update
                set last_fetched_at = excluded.last_fetched_at,
                    updated_at = now()
                """,
                (source, normalized_query, fetched_at),
            )

    @staticmethod
    def fetch_recent_mentions_for_query(
        conn: psycopg.Connection[Any],
        *,
        source: str,
        normalized_query: str,
        since: datetime,
        limit: int,
    ) -> list[MentionRecord]:
        if limit <= 0:
            return []
        like_pattern = f"%{Database._escape_like(normalized_query.casefold())}%"
        with conn.cursor() as cur:
            cur.execute(
                """
                select id, published_at
                from public.mentions
                where platform::text = %s
                  and published_at >= %s
                  and (
                    lower(coalesce(title, '')) like %s escape '\\'
                    or lower(coalesce(body_excerpt, '')) like %s escape '\\'
                    or lower(coalesce(author, '')) like %s escape '\\'
                    or lower(coalesce(community, '')) like %s escape '\\'
                    or (%s = 'devto' and lower(coalesce(raw_payload::text, '')) like %s escape '\\')
                  )
                order by published_at desc
                limit %s
                """,
                (
                    source,
                    since,
                    like_pattern,
                    like_pattern,
                    like_pattern,
                    like_pattern,
                    source,
                    like_pattern,
                    limit,
                ),
            )
            rows = cur.fetchall() or []

        return [
            MentionRecord(
                mention_id=row["id"],
                published_at=row["published_at"],
            )
            for row in rows
        ]

    @staticmethod
    def mark_source_task_success(
        conn: psycopg.Connection[Any],
        *,
        keyword_id: UUID,
        source: str,
        checked_at: datetime,
        poll_interval_minutes: int,
    ) -> None:
        next_poll = checked_at + timedelta(minutes=max(poll_interval_minutes, 1))
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into public.keyword_source_state
                  (keyword_id, source, last_checked_at, next_poll_at, last_error, updated_at)
                values (%s, %s, %s, %s, null, now())
                on conflict (keyword_id, source) do update
                set last_checked_at = excluded.last_checked_at,
                    next_poll_at = excluded.next_poll_at,
                    last_error = null,
                    updated_at = now()
                """,
                (keyword_id, source, checked_at, next_poll),
            )
        conn.commit()

    @staticmethod
    def mark_source_task_error(
        conn: psycopg.Connection[Any],
        *,
        keyword_id: UUID,
        source: str,
        error: str,
        backoff_minutes: int,
    ) -> None:
        next_poll = datetime.now(tz=timezone.utc) + timedelta(minutes=max(backoff_minutes, 1))
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into public.keyword_source_state
                  (keyword_id, source, next_poll_at, last_error, updated_at)
                values (%s, %s, %s, %s, now())
                on conflict (keyword_id, source) do update
                set next_poll_at = excluded.next_poll_at,
                    last_error = excluded.last_error,
                    updated_at = now()
                """,
                (keyword_id, source, next_poll, error[:800]),
            )
        conn.commit()

    @staticmethod
    def upsert_mention(conn: psycopg.Connection[Any], mention: MentionCandidate) -> int:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into public.mentions (
                  platform,
                  external_id,
                  url,
                  title,
                  body_excerpt,
                  author,
                  community,
                  published_at,
                  raw_payload,
                  fetched_at
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                on conflict (platform, external_id) do update
                set url = excluded.url,
                    title = excluded.title,
                    body_excerpt = excluded.body_excerpt,
                    author = excluded.author,
                    community = excluded.community,
                    published_at = excluded.published_at,
                    raw_payload = excluded.raw_payload,
                    fetched_at = now()
                returning id
                """,
                (
                    mention.platform,
                    mention.external_id,
                    mention.url,
                    mention.title,
                    mention.body_excerpt,
                    mention.author,
                    mention.community,
                    mention.published_at,
                    Jsonb(mention.raw_payload),
                ),
            )
            row = cur.fetchone()
        return row["id"]

    @staticmethod
    def insert_mention_match(
        conn: psycopg.Connection[Any],
        *,
        user_id: UUID,
        keyword_id: UUID,
        mention_id: int,
        matched_query: str,
    ) -> bool:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into public.mention_matches
                  (user_id, keyword_id, mention_id, matched_query)
                values (%s, %s, %s, %s)
                on conflict (user_id, mention_id, keyword_id) do nothing
                returning id
                """,
                (user_id, keyword_id, mention_id, matched_query),
            )
            row = cur.fetchone()
        return row is not None

    @staticmethod
    def enqueue_alert(
        conn: psycopg.Connection[Any],
        *,
        user_id: UUID,
        keyword_id: UUID,
        mention_id: int,
    ) -> bool:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into public.alert_deliveries
                  (user_id, keyword_id, mention_id, status, next_attempt_at)
                select %s, %s, %s, 'pending', now()
                from public.profiles p
                where p.id = %s
                  and p.plan_tier = 'growth_15'
                  and coalesce(nullif(btrim(p.slack_webhook_url_enc), ''), '') <> ''
                on conflict (user_id, mention_id, keyword_id, channel) do nothing
                returning id
                """,
                (user_id, keyword_id, mention_id, user_id),
            )
            row = cur.fetchone()
        return row is not None

    @staticmethod
    def fetch_pending_alerts(
        conn: psycopg.Connection[Any],
        *,
        limit: int,
        max_retries: int,
    ) -> list[PendingAlert]:
        with conn.cursor() as cur:
            cur.execute(
                """
                select
                  ad.id as alert_id,
                  ad.retry_count,
                  ad.user_id,
                  ad.keyword_id,
                  p.slack_webhook_url_enc as webhook_url,
                  k.query,
                  m.platform::text as platform,
                  m.external_id,
                  m.url,
                  coalesce(m.title, 'Mention') as title,
                  coalesce(m.body_excerpt, '') as body_excerpt,
                  m.author,
                  m.community,
                  m.published_at,
                  m.raw_payload
                from public.alert_deliveries ad
                join public.profiles p on p.id = ad.user_id
                join public.keywords k on k.id = ad.keyword_id
                join public.mentions m on m.id = ad.mention_id
                where ad.status in ('pending', 'failed')
                  and ad.next_attempt_at <= now()
                  and ad.retry_count < %s
                  and p.plan_tier = 'growth_15'
                  and coalesce(nullif(btrim(p.slack_webhook_url_enc), ''), '') <> ''
                order by ad.next_attempt_at asc
                limit %s
                """,
                (max_retries, limit),
            )
            rows = cur.fetchall()

        pending: list[PendingAlert] = []
        for row in rows:
            pending.append(
                PendingAlert(
                    alert_id=row["alert_id"],
                    retry_count=row["retry_count"],
                    user_id=row["user_id"],
                    keyword_id=row["keyword_id"],
                    webhook_url=row["webhook_url"],
                    query=row["query"],
                    mention=MentionCandidate(
                        platform=row["platform"],
                        external_id=row["external_id"],
                        url=row["url"],
                        title=row["title"],
                        body_excerpt=row["body_excerpt"],
                        author=row["author"],
                        community=row["community"],
                        published_at=row["published_at"],
                        raw_payload=row["raw_payload"] or {},
                    ),
                )
            )

        return pending

    @staticmethod
    def mark_alert_sent(conn: psycopg.Connection[Any], *, alert_id: int) -> None:
        with conn.cursor() as cur:
            cur.execute(
                """
                update public.alert_deliveries
                set status = 'sent',
                    sent_at = now(),
                    last_error = null,
                    updated_at = now()
                where id = %s
                """,
                (alert_id,),
            )
        conn.commit()

    @staticmethod
    def mark_alert_retry(
        conn: psycopg.Connection[Any],
        *,
        alert_id: int,
        retry_count: int,
        max_retries: int,
        next_attempt_at: datetime,
        error: str,
    ) -> None:
        final_status = "failed" if retry_count < max_retries else "dead_letter"
        with conn.cursor() as cur:
            cur.execute(
                """
                update public.alert_deliveries
                set status = %s,
                    retry_count = %s,
                    next_attempt_at = %s,
                    last_error = %s,
                    updated_at = now()
                where id = %s
                """,
                (final_status, retry_count, next_attempt_at, error[:800], alert_id),
            )
        conn.commit()

    @staticmethod
    def cleanup_mentions_older_than(
        conn: psycopg.Connection[Any],
        *,
        cutoff: datetime,
    ) -> int:
        with conn.cursor() as cur:
            cur.execute(
                """
                delete from public.mentions
                where published_at < %s
                """,
                (cutoff,),
            )
            deleted = cur.rowcount or 0
        conn.commit()
        return int(deleted)

    @staticmethod
    def _escape_like(value: str) -> str:
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
