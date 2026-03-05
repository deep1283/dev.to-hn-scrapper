from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
import sys
import types
import unittest
from uuid import uuid4

# The worker's DB module imports psycopg, but these unit tests stub DB access.
# Provide lightweight module stubs so tests run without installing psycopg locally.
if "psycopg" not in sys.modules:
    psycopg_stub = types.ModuleType("psycopg")
    psycopg_stub.connect = lambda *_args, **_kwargs: None
    sys.modules["psycopg"] = psycopg_stub

if "psycopg.rows" not in sys.modules:
    rows_stub = types.ModuleType("psycopg.rows")
    rows_stub.dict_row = object()
    sys.modules["psycopg.rows"] = rows_stub

if "psycopg.types" not in sys.modules:
    sys.modules["psycopg.types"] = types.ModuleType("psycopg.types")

if "psycopg.types.json" not in sys.modules:
    json_stub = types.ModuleType("psycopg.types.json")
    json_stub.Jsonb = lambda value: value
    sys.modules["psycopg.types.json"] = json_stub

from mention_worker.config import Settings
from mention_worker.models import MentionCandidate, MentionRecord, QueryCacheEntry, SourceTask
from mention_worker.pipeline import Worker
from mention_worker.sources.registry import SOURCE_DEFINITIONS


def _make_settings(**overrides) -> Settings:
    source_keys = tuple(source.key for source in SOURCE_DEFINITIONS)
    source_enabled = {key: False for key in source_keys}
    source_enabled.update(
        {
            "hackernews": True,
            "devto": True,
            "github_discussions": True,
            "reddit": False,
            "google": False,
            "brave": False,
            "producthunt": False,
        }
    )
    source_poll_interval_minutes = {key: 360 for key in source_keys}
    source_poll_interval_minutes.update(
        {
            "devto": 720,
            "google": 1440,
            "brave": 1440,
            "producthunt": 1440,
        }
    )
    source_daily_request_limit = {
        "hackernews": 2000,
        "devto": 1000,
        "github_discussions": 1000,
        "reddit": 500,
        "google": 100,
        "brave": 1000,
        "producthunt": 500,
    }

    values = {
        "database_url": "postgresql://postgres:postgres@localhost:5432/postgres",
        "worker_lock_key": 1,
        "free_tier_mode": True,
        "poll_interval_minutes": 15,
        "overlap_minutes": 3,
        "per_source_limit": 40,
        "source_task_batch_size": 300,
        "alert_batch_size": 250,
        "max_alert_retries": 3,
        "retry_base_seconds": 60,
        "retry_max_seconds": 1800,
        "reddit_client_id": None,
        "reddit_client_secret": None,
        "reddit_user_agent": "mention-worker/1.0",
        "devto_top_days": 7,
        "google_api_key": None,
        "google_cse_id": None,
        "brave_api_key": None,
        "github_token": "ghp_test",
        "request_timeout_seconds": 20.0,
        "source_keys": source_keys,
        "source_enabled": source_enabled,
        "plan_poll_interval_minutes": {
            "starter_9": 300,
            "growth_15": 180,
        },
        "source_poll_interval_minutes": source_poll_interval_minutes,
        "source_query_cache_ttl_minutes": {key: 15 for key in source_keys},
        "source_incremental_lookback_hours": {key: 24 for key in source_keys},
        "source_daily_request_limit": source_daily_request_limit,
        "mention_retention_days": 7,
        "initial_backfill_days": 7,
    }
    values.update(overrides)
    return Settings(**values)


class _NoSearchSource:
    def search(self, *_args, **_kwargs):
        raise AssertionError("search should not be called when source budget is exhausted")


class _BudgetDB:
    def __init__(self, tasks: list[SourceTask]) -> None:
        self._tasks = tasks
        self.error_calls: list[dict] = []

    def fetch_due_source_tasks(self, *_args, **_kwargs):
        return self._tasks

    def mark_source_task_error(self, _conn, *, keyword_id, source, error, backoff_minutes):
        self.error_calls.append(
            {
                "keyword_id": keyword_id,
                "source": source,
                "error": error,
                "backoff_minutes": backoff_minutes,
            }
        )

    def fetch_query_cache_entries(self, *_args, **_kwargs):
        return {}

    def try_query_advisory_lock(self, *_args, **_kwargs):
        return True

    def release_query_advisory_lock(self, *_args, **_kwargs):
        return None


class _FixedSource:
    def __init__(self, mentions: list[MentionCandidate]) -> None:
        self._mentions = mentions

    def search(self, *_args, **_kwargs):
        return self._mentions


class _NoFetchSource:
    def search(self, *_args, **_kwargs):
        raise AssertionError("search should not be called for fresh query cache")


class _DedupeDB:
    def __init__(self, tasks: list[SourceTask]) -> None:
        self._tasks = tasks
        self.enqueue_calls = 0
        self.success_calls = 0
        self.cached_mentions: list[MentionRecord] = [
            MentionRecord(mention_id=42, published_at=datetime.now(tz=timezone.utc))
        ]

    def fetch_due_source_tasks(self, *_args, **_kwargs):
        return self._tasks

    def fetch_query_cache_entries(self, *_args, **_kwargs):
        return {}

    def fetch_recent_mentions_for_query(self, *_args, **_kwargs):
        return self.cached_mentions

    def upsert_mention(self, *_args, **_kwargs):
        return 42

    def insert_mention_match(self, *_args, **_kwargs):
        return False

    def enqueue_alert(self, *_args, **_kwargs):
        self.enqueue_calls += 1
        return True

    def mark_source_task_success(self, *_args, **_kwargs):
        self.success_calls += 1

    def mark_source_task_error(self, *_args, **_kwargs):
        raise AssertionError("mark_source_task_error should not be called for success path")

    def upsert_query_cache_entry(self, *_args, **_kwargs):
        return None

    def try_query_advisory_lock(self, *_args, **_kwargs):
        return True

    def release_query_advisory_lock(self, *_args, **_kwargs):
        return None


class _CacheReuseDB:
    def __init__(self, tasks: list[SourceTask], mention_id: int) -> None:
        self._tasks = tasks
        self._mention_id = mention_id
        self.success_calls = 0

    def fetch_due_source_tasks(self, *_args, **_kwargs):
        return self._tasks

    def fetch_query_cache_entries(self, *_args, **_kwargs):
        task = self._tasks[0]
        key = (task.source, " ".join(task.query.casefold().split()))
        return {
            key: QueryCacheEntry(
                source=task.source,
                normalized_query=key[1],
                last_fetched_at=datetime.now(tz=timezone.utc),
            )
        }

    def fetch_recent_mentions_for_query(self, *_args, **_kwargs):
        return [MentionRecord(mention_id=self._mention_id, published_at=datetime.now(tz=timezone.utc))]

    def insert_mention_match(self, *_args, **_kwargs):
        return True

    def enqueue_alert(self, *_args, **_kwargs):
        return False

    def mark_source_task_success(self, *_args, **_kwargs):
        self.success_calls += 1

    def mark_source_task_error(self, *_args, **_kwargs):
        raise AssertionError("mark_source_task_error should not be called for cache hit path")


class _QueryLockContentionDB:
    def __init__(self, tasks: list[SourceTask]) -> None:
        self._tasks = tasks
        self.error_calls = 0

    def fetch_due_source_tasks(self, *_args, **_kwargs):
        return self._tasks

    def fetch_query_cache_entries(self, *_args, **_kwargs):
        return {}

    def try_query_advisory_lock(self, *_args, **_kwargs):
        return False

    def mark_source_task_error(self, *_args, **_kwargs):
        self.error_calls += 1


class WorkerPipelineTests(unittest.TestCase):
    def test_daily_budget_reached_defers_task_until_utc_rollover(self) -> None:
        base_settings = _make_settings()
        settings = _make_settings(
            source_daily_request_limit={
                **base_settings.source_daily_request_limit,
                "github_discussions": 1,
            }
        )
        worker = Worker(settings)

        task = SourceTask(
            keyword_id=uuid4(),
            user_id=uuid4(),
            plan_tier="starter_9",
            query="signalze",
            source="github_discussions",
            last_checked_at=None,
        )
        fake_db = _BudgetDB([task])
        worker.db = fake_db  # type: ignore[assignment]

        stats: dict[str, int] = defaultdict(int)
        source_requests_run: dict[str, int] = defaultdict(int)
        source_requests_today = {"github_discussions": 1}

        worker._process_source_tasks(
            conn=object(),
            sources={"github_discussions": _NoSearchSource()},
            stats=stats,
            source_requests_run=source_requests_run,
            source_requests_today=source_requests_today,
        )

        self.assertEqual(stats["tasks_polled"], 1)
        self.assertEqual(stats["tasks_deferred_budget"], 1)
        self.assertEqual(len(fake_db.error_calls), 1)
        backoff = fake_db.error_calls[0]["backoff_minutes"]
        self.assertGreaterEqual(backoff, 1)
        self.assertLessEqual(backoff, 1440)
        self.assertEqual(source_requests_run.get("github_discussions", 0), 0)

    def test_deduped_match_does_not_enqueue_alert_again(self) -> None:
        settings = _make_settings()
        worker = Worker(settings)

        task = SourceTask(
            keyword_id=uuid4(),
            user_id=uuid4(),
            plan_tier="starter_9",
            query="signalze",
            source="hackernews",
            last_checked_at=None,
        )
        mention = MentionCandidate(
            platform="hackernews",
            external_id="hn-123",
            url="https://news.ycombinator.com/item?id=123",
            title="Signalze mention",
            body_excerpt="Signalze was discussed in this thread.",
            author="alice",
            community="Hacker News",
            published_at=datetime.now(tz=timezone.utc),
            raw_payload={},
        )

        fake_db = _DedupeDB([task])
        worker.db = fake_db  # type: ignore[assignment]

        stats: dict[str, int] = defaultdict(int)
        source_requests_run: dict[str, int] = defaultdict(int)
        source_requests_today: dict[str, int] = defaultdict(int)

        worker._process_source_tasks(
            conn=object(),
            sources={"hackernews": _FixedSource([mention])},
            stats=stats,
            source_requests_run=source_requests_run,
            source_requests_today=source_requests_today,
        )

        self.assertEqual(stats["tasks_polled"], 1)
        self.assertEqual(stats["source_mentions_fetched"], 1)
        self.assertEqual(stats["mentions_upserted"], 1)
        self.assertEqual(stats["matches_deduped"], 1)
        self.assertEqual(stats.get("alerts_enqueued", 0), 0)
        self.assertEqual(fake_db.enqueue_calls, 0)
        self.assertEqual(fake_db.success_calls, 1)

    def test_fresh_query_cache_skips_source_fetch_and_reuses_db_mentions(self) -> None:
        settings = _make_settings()
        worker = Worker(settings)

        task = SourceTask(
            keyword_id=uuid4(),
            user_id=uuid4(),
            plan_tier="starter_9",
            query="signalze",
            source="github_discussions",
            last_checked_at=None,
        )

        fake_db = _CacheReuseDB([task], mention_id=99)
        worker.db = fake_db  # type: ignore[assignment]

        stats: dict[str, int] = defaultdict(int)
        source_requests_run: dict[str, int] = defaultdict(int)
        source_requests_today: dict[str, int] = defaultdict(int)

        worker._process_source_tasks(
            conn=object(),
            sources={"github_discussions": _NoFetchSource()},
            stats=stats,
            source_requests_run=source_requests_run,
            source_requests_today=source_requests_today,
        )

        self.assertEqual(stats["tasks_polled"], 1)
        self.assertEqual(stats["query_cache_hits"], 1)
        self.assertEqual(stats["matches_created"], 1)
        self.assertEqual(stats.get("source_mentions_fetched", 0), 0)
        self.assertEqual(source_requests_run.get("github_discussions", 0), 0)
        self.assertEqual(fake_db.success_calls, 1)

    def test_query_lock_contention_defers_tasks_without_source_fetch(self) -> None:
        settings = _make_settings()
        worker = Worker(settings)

        task = SourceTask(
            keyword_id=uuid4(),
            user_id=uuid4(),
            plan_tier="starter_9",
            query="signalze",
            source="devto",
            last_checked_at=None,
        )

        fake_db = _QueryLockContentionDB([task])
        worker.db = fake_db  # type: ignore[assignment]

        stats: dict[str, int] = defaultdict(int)
        source_requests_run: dict[str, int] = defaultdict(int)
        source_requests_today: dict[str, int] = defaultdict(int)

        worker._process_source_tasks(
            conn=object(),
            sources={"devto": _NoFetchSource()},
            stats=stats,
            source_requests_run=source_requests_run,
            source_requests_today=source_requests_today,
        )

        self.assertEqual(stats["tasks_polled"], 1)
        self.assertEqual(stats["query_lock_contention"], 1)
        self.assertEqual(stats["tasks_deferred_query_lock"], 1)
        self.assertEqual(stats.get("source_mentions_fetched", 0), 0)
        self.assertEqual(fake_db.error_calls, 1)


if __name__ == "__main__":
    unittest.main()
