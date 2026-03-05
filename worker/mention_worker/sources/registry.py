from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional, Tuple

import httpx

from mention_worker.sources.devto import DevToSource
from mention_worker.sources.github_discussions import GitHubDiscussionsSource
from mention_worker.sources.hackernews import HackerNewsSource
from mention_worker.sources.reddit import RedditSource

SourceBuilder = Callable[[httpx.Client, Any], Tuple[Optional[object], Optional[str]]]


@dataclass(frozen=True)
class SourceDefinition:
    key: str
    label: str
    env_slug: str
    default_enabled: bool
    free_tier_daily_limit: int | None
    builder: SourceBuilder | None = None


def _build_hackernews(client: httpx.Client, _settings: Any) -> tuple[object | None, str | None]:
    return HackerNewsSource(client), None


def _build_devto(client: httpx.Client, settings: Any) -> tuple[object | None, str | None]:
    return (
        DevToSource(
            client,
            top_days=getattr(settings, "devto_top_days", 7),
            page_size=getattr(settings, "devto_page_size", 50),
            max_pages=getattr(settings, "devto_max_pages", 2),
        ),
        None,
    )


def _build_github_discussions(client: httpx.Client, settings: Any) -> tuple[object | None, str | None]:
    token = settings.github_token
    if not token:
        return None, "missing_credentials"
    return GitHubDiscussionsSource(client, token=token), None


def _build_reddit(client: httpx.Client, settings: Any) -> tuple[object | None, str | None]:
    client_id = settings.reddit_client_id
    client_secret = settings.reddit_client_secret
    if not client_id or not client_secret:
        return None, "missing_credentials"
    return (
        RedditSource(
            client=client,
            client_id=client_id,
            client_secret=client_secret,
            user_agent=settings.reddit_user_agent,
        ),
        None,
    )


SOURCE_DEFINITIONS: tuple[SourceDefinition, ...] = (
    SourceDefinition(
        key="hackernews",
        label="Hacker News",
        env_slug="HN",
        default_enabled=True,
        free_tier_daily_limit=2_000,
        builder=_build_hackernews,
    ),
    SourceDefinition(
        key="devto",
        label="Dev.to",
        env_slug="DEVTO",
        default_enabled=True,
        free_tier_daily_limit=1_000,
        builder=_build_devto,
    ),
    SourceDefinition(
        key="github_discussions",
        label="GitHub Discussions",
        env_slug="GITHUB_DISCUSSIONS",
        default_enabled=True,
        free_tier_daily_limit=1_000,
        builder=_build_github_discussions,
    ),
    SourceDefinition(
        key="reddit",
        label="Reddit",
        env_slug="REDDIT",
        default_enabled=False,
        free_tier_daily_limit=500,
        builder=_build_reddit,
    ),
    SourceDefinition(
        key="google",
        label="Google",
        env_slug="GOOGLE",
        default_enabled=False,
        free_tier_daily_limit=100,
        builder=None,
    ),
    SourceDefinition(
        key="brave",
        label="Brave",
        env_slug="BRAVE",
        default_enabled=False,
        free_tier_daily_limit=1_000,
        builder=None,
    ),
    SourceDefinition(
        key="producthunt",
        label="Product Hunt",
        env_slug="PRODUCTHUNT",
        default_enabled=False,
        free_tier_daily_limit=500,
        builder=None,
    ),
)

SOURCE_DEFINITION_BY_KEY: dict[str, SourceDefinition] = {
    definition.key: definition for definition in SOURCE_DEFINITIONS
}


def source_label(source: str) -> str:
    definition = SOURCE_DEFINITION_BY_KEY.get(source)
    if definition:
        return definition.label
    return source
