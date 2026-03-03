from __future__ import annotations

from datetime import datetime, timezone
from html import unescape
import re

import httpx

from mention_worker.models import MentionCandidate

_ALGOLIA_URL = "https://hn.algolia.com/api/v1/search_by_date"
_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(value: str | None) -> str:
    if not value:
        return ""
    text = _TAG_RE.sub(" ", value)
    return unescape(" ".join(text.split()))


class HackerNewsSource:
    def __init__(self, client: httpx.Client) -> None:
        self._client = client

    def search(self, query: str, *, since: datetime, limit: int) -> list[MentionCandidate]:
        params = {
            "query": query,
            # Algolia requires grouped OR syntax for multiple tags.
            "tags": "(story,comment)",
            "hitsPerPage": min(max(limit, 1), 100),
            "numericFilters": f"created_at_i>{int(since.timestamp())}",
        }
        response = self._client.get(_ALGOLIA_URL, params=params)
        response.raise_for_status()
        payload = response.json()

        results: list[MentionCandidate] = []
        for hit in payload.get("hits", []):
            object_id = hit.get("objectID")
            if not object_id:
                continue

            created_at = hit.get("created_at")
            try:
                published_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            except Exception:
                published_at = datetime.now(tz=timezone.utc)

            title = hit.get("title") or hit.get("story_title") or "Hacker News mention"
            excerpt = _strip_html(hit.get("comment_text") or hit.get("story_text") or "")
            # Always link to the HN discussion thread so users can reply in-context.
            url = f"https://news.ycombinator.com/item?id={object_id}"

            results.append(
                MentionCandidate(
                    platform="hackernews",
                    external_id=str(object_id),
                    url=url,
                    title=title.strip(),
                    body_excerpt=excerpt[:500],
                    author=hit.get("author"),
                    community="Hacker News",
                    published_at=published_at,
                    raw_payload=hit,
                )
            )

        return results
