from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

from mention_worker.sources.registry import SOURCE_DEFINITIONS


@dataclass
class Settings:
    database_url: str
    worker_lock_key: int
    free_tier_mode: bool
    poll_interval_minutes: int
    overlap_minutes: int
    per_source_limit: int
    source_task_batch_size: int
    alert_batch_size: int
    max_alert_retries: int
    retry_base_seconds: int
    retry_max_seconds: int
    reddit_client_id: str | None
    reddit_client_secret: str | None
    reddit_user_agent: str
    devto_top_days: int
    devto_page_size: int
    devto_max_pages: int
    google_api_key: str | None
    google_cse_id: str | None
    brave_api_key: str | None
    github_token: str | None
    request_timeout_seconds: float
    source_keys: tuple[str, ...]
    source_enabled: dict[str, bool]
    plan_poll_interval_minutes: dict[str, int]
    source_poll_interval_minutes: dict[str, int]
    source_query_cache_ttl_minutes: dict[str, int]
    source_incremental_lookback_hours: dict[str, int]
    source_daily_request_limit: dict[str, int | None]
    mention_retention_days: int
    initial_backfill_days: int

    def is_source_enabled(self, source: str) -> bool:
        return bool(self.source_enabled.get(source, False))

    def poll_interval_for_source(self, source: str) -> int:
        return int(self.source_poll_interval_minutes.get(source, self.poll_interval_minutes))

    def poll_interval_for_plan(self, plan_tier: str, *, fallback_source: str | None = None) -> int:
        plan_interval = self.plan_poll_interval_minutes.get(plan_tier)
        if plan_interval is not None:
            return int(plan_interval)
        if fallback_source is not None:
            return int(self.source_poll_interval_minutes.get(fallback_source, self.poll_interval_minutes))
        return int(self.poll_interval_minutes)

    def daily_request_limit_for_source(self, source: str) -> int | None:
        return self.source_daily_request_limit.get(source)

    def query_cache_ttl_for_source(self, source: str) -> int:
        return int(self.source_query_cache_ttl_minutes.get(source, self.poll_interval_minutes))

    def incremental_lookback_hours_for_source(self, source: str) -> int:
        return int(self.source_incremental_lookback_hours.get(source, 24))


def _to_bool(value: str | None, *, default: bool) -> bool:
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _to_optional_int(value: str | None) -> int | None:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    parsed = int(stripped)
    if parsed < 1:
        return None
    return parsed


def load_settings() -> Settings:
    # Explicitly load .env.local first, fallback to .env
    from pathlib import Path
    dotenv_path = Path(__file__).parent.parent / ".env.local"
    if dotenv_path.exists():
        load_dotenv(dotenv_path=dotenv_path)
    else:
        load_dotenv()

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")

    free_tier_mode = _to_bool(os.getenv("FREE_TIER_MODE"), default=True)
    poll_interval_minutes = int(os.getenv("POLL_INTERVAL_MINUTES", "15"))

    source_enabled: dict[str, bool] = {}
    plan_poll_interval_minutes = {
        "starter_9": max(int(os.getenv("PLAN_STARTER_9_POLL_INTERVAL_MINUTES", "300")), 1),
        "growth_15": max(int(os.getenv("PLAN_GROWTH_15_POLL_INTERVAL_MINUTES", "180")), 1),
    }
    source_poll_interval_minutes: dict[str, int] = {}
    source_query_cache_ttl_minutes: dict[str, int] = {}
    source_incremental_lookback_hours: dict[str, int] = {}
    source_daily_request_limit: dict[str, int | None] = {}

    for source in SOURCE_DEFINITIONS:
        enabled = _to_bool(
            os.getenv(f"SOURCE_{source.env_slug}_ENABLED"),
            default=source.default_enabled,
        )
        poll_minutes = int(
            os.getenv(
                f"SOURCE_{source.env_slug}_POLL_INTERVAL_MINUTES",
                str(poll_interval_minutes),
            )
        )
        daily_limit = _to_optional_int(
            os.getenv(f"SOURCE_{source.env_slug}_DAILY_REQUEST_LIMIT")
        )
        query_cache_ttl_minutes = int(
            os.getenv(
                f"SOURCE_{source.env_slug}_QUERY_CACHE_TTL_MINUTES",
                str(poll_minutes),
            )
        )
        incremental_lookback_hours = int(
            os.getenv(
                f"SOURCE_{source.env_slug}_INCREMENTAL_LOOKBACK_HOURS",
                "24",
            )
        )
        if free_tier_mode and daily_limit is None:
            daily_limit = source.free_tier_daily_limit

        source_enabled[source.key] = enabled
        source_poll_interval_minutes[source.key] = max(poll_minutes, 1)
        source_query_cache_ttl_minutes[source.key] = max(query_cache_ttl_minutes, 1)
        source_incremental_lookback_hours[source.key] = max(incremental_lookback_hours, 1)
        source_daily_request_limit[source.key] = daily_limit

    return Settings(
        database_url=database_url,
        worker_lock_key=int(os.getenv("WORKER_LOCK_KEY", "84521791")),
        free_tier_mode=free_tier_mode,
        poll_interval_minutes=poll_interval_minutes,
        overlap_minutes=int(os.getenv("SOURCE_OVERLAP_MINUTES", "3")),
        per_source_limit=int(os.getenv("PER_SOURCE_RESULT_LIMIT", "40")),
        source_task_batch_size=int(os.getenv("SOURCE_TASK_BATCH_SIZE", "300")),
        alert_batch_size=int(os.getenv("ALERT_BATCH_SIZE", "250")),
        max_alert_retries=int(os.getenv("MAX_ALERT_RETRIES", "3")),
        retry_base_seconds=int(os.getenv("ALERT_RETRY_BASE_SECONDS", "60")),
        retry_max_seconds=int(os.getenv("ALERT_RETRY_MAX_SECONDS", "1800")),
        reddit_client_id=os.getenv("REDDIT_CLIENT_ID"),
        reddit_client_secret=os.getenv("REDDIT_CLIENT_SECRET"),
        reddit_user_agent=os.getenv("REDDIT_USER_AGENT", "mention-worker/1.0"),
        devto_top_days=int(os.getenv("DEVTO_TOP_DAYS", "7")),
        devto_page_size=int(os.getenv("DEVTO_PAGE_SIZE", "50")),
        devto_max_pages=int(os.getenv("DEVTO_MAX_PAGES", "2")),
        google_api_key=os.getenv("GOOGLE_API_KEY"),
        google_cse_id=os.getenv("GOOGLE_CSE_ID"),
        brave_api_key=os.getenv("BRAVE_API_KEY"),
        github_token=os.getenv("GITHUB_TOKEN"),
        request_timeout_seconds=float(os.getenv("REQUEST_TIMEOUT_SECONDS", "20")),
        source_keys=tuple(source.key for source in SOURCE_DEFINITIONS),
        source_enabled=source_enabled,
        plan_poll_interval_minutes=plan_poll_interval_minutes,
        source_poll_interval_minutes=source_poll_interval_minutes,
        source_query_cache_ttl_minutes=source_query_cache_ttl_minutes,
        source_incremental_lookback_hours=source_incremental_lookback_hours,
        source_daily_request_limit=source_daily_request_limit,
        mention_retention_days=max(int(os.getenv("MENTION_RETENTION_DAYS", "7")), 1),
        initial_backfill_days=max(int(os.getenv("INITIAL_BACKFILL_DAYS", "7")), 1),
    )
