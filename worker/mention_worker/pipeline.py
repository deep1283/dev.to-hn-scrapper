from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
import traceback
from typing import Any

import httpx

from mention_worker.config import Settings
from mention_worker.db import Database
from mention_worker.slack import send_slack_alert
from mention_worker.sources.registry import SOURCE_DEFINITIONS


class Worker:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.db = Database(settings.database_url)

    def run_once(self) -> int:
        stats: dict[str, Any] = defaultdict(int)

        with self.db.connection() as conn:
            if not self.db.try_advisory_lock(conn, self.settings.worker_lock_key):
                print("{\"event\":\"worker_skip\",\"reason\":\"lock_not_acquired\"}")
                return 0

            run_id = self.db.create_worker_run(conn)
            print(f"{{\"event\":\"worker_start\",\"run_id\":\"{run_id}\"}}")

            try:
                source_requests_today = self.db.fetch_today_source_requests(
                    conn,
                    source_keys=self.settings.source_keys,
                )
                source_requests_run: dict[str, int] = defaultdict(int)

                with httpx.Client(timeout=self.settings.request_timeout_seconds) as http_client:
                    sources = self._build_sources(http_client)
                    self._process_source_tasks(
                        conn,
                        sources,
                        stats,
                        source_requests_run=source_requests_run,
                        source_requests_today=source_requests_today,
                    )
                    self._process_alerts(conn, http_client, stats)

                stats["source_requests"] = dict(source_requests_run)
                stats["source_requests_today_after"] = dict(source_requests_today)

                self.db.finish_worker_run(conn, run_id=run_id, status="success", stats=dict(stats))
                print(
                    f"{{\"event\":\"worker_success\",\"run_id\":\"{run_id}\",\"stats\":{dict(stats)!r}}}"
                )
                return 0
            except Exception as exc:  # noqa: BLE001
                conn.rollback()
                self.db.finish_worker_run(
                    conn,
                    run_id=run_id,
                    status="failed",
                    stats=dict(stats),
                    error=str(exc),
                )
                print(
                    f"{{\"event\":\"worker_failed\",\"run_id\":\"{run_id}\",\"error\":{str(exc)!r}}}"
                )
                print(traceback.format_exc())
                return 1

    def _build_sources(self, http_client: httpx.Client) -> dict[str, object]:
        sources: dict[str, object] = {}

        for definition in SOURCE_DEFINITIONS:
            if not self.settings.is_source_enabled(definition.key):
                continue

            if definition.builder is None:
                print(
                    f"{{\"event\":\"source_disabled\",\"source\":\"{definition.key}\",\"reason\":\"unsupported_adapter\"}}"
                )
                continue

            source_client, reason = definition.builder(http_client, self.settings)
            if source_client is None:
                disabled_reason = reason or "missing_credentials"
                print(
                    f"{{\"event\":\"source_disabled\",\"source\":\"{definition.key}\",\"reason\":\"{disabled_reason}\"}}"
                )
                continue

            sources[definition.key] = source_client

        return sources

    def _process_source_tasks(
        self,
        conn,
        sources: dict[str, object],
        stats: dict[str, Any],
        *,
        source_requests_run: dict[str, int],
        source_requests_today: dict[str, int],
    ) -> None:
        enabled_sources = tuple(sorted(sources.keys()))
        tasks = self.db.fetch_due_source_tasks(
            conn,
            batch_size=self.settings.source_task_batch_size,
            enabled_sources=enabled_sources,
        )
        stats["tasks_polled"] += len(tasks)

        for task in tasks:
            source_client = sources.get(task.source)
            if source_client is None:
                self.db.mark_source_task_error(
                    conn,
                    keyword_id=task.keyword_id,
                    source=task.source,
                    error="Source not enabled in worker",
                    backoff_minutes=self.settings.poll_interval_minutes,
                )
                stats["task_errors"] += 1
                continue

            if self._source_daily_limit_reached(task.source, source_requests_today):
                now = datetime.now(tz=timezone.utc)
                self.db.mark_source_task_error(
                    conn,
                    keyword_id=task.keyword_id,
                    source=task.source,
                    error="Daily source request budget reached; deferred until UTC day rollover",
                    backoff_minutes=self._minutes_until_utc_day_rollover(now),
                )
                stats["tasks_deferred_budget"] += 1
                continue

            now = datetime.now(tz=timezone.utc)
            default_since = now - timedelta(days=7)
            since = task.last_checked_at or default_since
            since = since - timedelta(minutes=max(self.settings.overlap_minutes, 0))

            try:
                mentions = source_client.search(task.query, since=since, limit=self.settings.per_source_limit)
                source_requests_today[task.source] = source_requests_today.get(task.source, 0) + 1
                source_requests_run[task.source] = source_requests_run.get(task.source, 0) + 1
                stats["source_mentions_fetched"] += len(mentions)

                for mention in mentions:
                    mention_id = self.db.upsert_mention(conn, mention)
                    stats["mentions_upserted"] += 1

                    inserted_match = self.db.insert_mention_match(
                        conn,
                        user_id=task.user_id,
                        keyword_id=task.keyword_id,
                        brand_id=task.brand_id,
                        mention_id=mention_id,
                        matched_query=task.query,
                    )
                    if not inserted_match:
                        stats["matches_deduped"] += 1
                        continue

                    stats["matches_created"] += 1
                    inserted_alert = self.db.enqueue_alert(
                        conn,
                        user_id=task.user_id,
                        keyword_id=task.keyword_id,
                        mention_id=mention_id,
                    )
                    if inserted_alert:
                        stats["alerts_enqueued"] += 1
                    else:
                        stats["alerts_deduped"] += 1

                self.db.mark_source_task_success(
                    conn,
                    keyword_id=task.keyword_id,
                    source=task.source,
                    checked_at=now,
                    poll_interval_minutes=self._poll_interval_for_source(task.source),
                )
                stats["tasks_succeeded"] += 1
            except Exception as exc:  # noqa: BLE001
                conn.rollback()
                self.db.mark_source_task_error(
                    conn,
                    keyword_id=task.keyword_id,
                    source=task.source,
                    error=str(exc),
                    backoff_minutes=self._poll_interval_for_source(task.source),
                )
                stats["task_errors"] += 1

    def _process_alerts(self, conn, http_client: httpx.Client, stats: dict[str, Any]) -> None:
        alerts = self.db.fetch_pending_alerts(
            conn,
            limit=self.settings.alert_batch_size,
            max_retries=self.settings.max_alert_retries,
        )
        stats["alerts_attempted"] += len(alerts)

        for alert in alerts:
            if not alert.webhook_url or not alert.webhook_url.startswith("http"):
                next_retry = alert.retry_count + 1
                self.db.mark_alert_retry(
                    conn,
                    alert_id=alert.alert_id,
                    retry_count=next_retry,
                    max_retries=self.settings.max_alert_retries,
                    next_attempt_at=datetime.now(tz=timezone.utc)
                    + timedelta(seconds=self._retry_delay_seconds(next_retry)),
                    error="Slack webhook missing or invalid",
                )
                stats["alerts_failed"] += 1
                continue

            try:
                send_slack_alert(http_client, webhook_url=alert.webhook_url, alert=alert)
                self.db.mark_alert_sent(conn, alert_id=alert.alert_id)
                stats["alerts_sent"] += 1
            except Exception as exc:  # noqa: BLE001
                next_retry = alert.retry_count + 1
                self.db.mark_alert_retry(
                    conn,
                    alert_id=alert.alert_id,
                    retry_count=next_retry,
                    max_retries=self.settings.max_alert_retries,
                    next_attempt_at=datetime.now(tz=timezone.utc)
                    + timedelta(seconds=self._retry_delay_seconds(next_retry)),
                    error=str(exc),
                )
                stats["alerts_failed"] += 1

    def _retry_delay_seconds(self, retry_count: int) -> int:
        exponent = max(retry_count - 1, 0)
        delay = self.settings.retry_base_seconds * (2**exponent)
        return min(delay, self.settings.retry_max_seconds)

    def _poll_interval_for_source(self, source: str) -> int:
        return self.settings.poll_interval_for_source(source)

    def _source_daily_limit_reached(self, source: str, source_requests_today: dict[str, int]) -> bool:
        limit = self.settings.daily_request_limit_for_source(source)
        if limit is None:
            return False
        return source_requests_today.get(source, 0) >= limit

    @staticmethod
    def _minutes_until_utc_day_rollover(now: datetime) -> int:
        next_day = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        delta = next_day - now
        return max(int(delta.total_seconds() // 60), 1)
