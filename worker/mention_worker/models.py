from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID


@dataclass
class SourceTask:
    keyword_id: UUID
    user_id: UUID
    plan_tier: str
    query: str
    source: str
    last_checked_at: datetime | None


@dataclass
class MentionCandidate:
    platform: str
    external_id: str
    url: str
    title: str
    body_excerpt: str
    author: str | None
    community: str | None
    published_at: datetime
    raw_payload: dict[str, Any]


@dataclass
class PendingAlert:
    alert_id: int
    retry_count: int
    user_id: UUID
    keyword_id: UUID
    webhook_url: str | None
    query: str
    mention: MentionCandidate


@dataclass
class QueryCacheEntry:
    source: str
    normalized_query: str
    last_fetched_at: datetime


@dataclass
class MentionRecord:
    mention_id: int
    published_at: datetime
