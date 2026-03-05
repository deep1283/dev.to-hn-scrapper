from __future__ import annotations

from datetime import datetime, timezone

import httpx

from mention_worker.models import MentionCandidate

_DEVTO_ARTICLES_URL = "https://dev.to/api/articles"


class DevToSource:
    """Best-effort Dev.to polling using public articles API.

    Dev.to's public API does not expose full-text query search across all posts,
    so we fetch recent articles and apply local keyword matching.
    """

    def __init__(
        self,
        client: httpx.Client,
        *,
        top_days: int = 7,
        page_size: int = 50,
        max_pages: int = 2,
    ) -> None:
        self._client = client
        self._top_days = max(top_days, 1)
        self._page_size = min(max(page_size, 10), 100)
        self._max_pages = max(max_pages, 1)

    def search(self, query: str, *, since: datetime, limit: int) -> list[MentionCandidate]:
        normalized = query.casefold().strip()
        if not normalized:
            return []

        results: list[MentionCandidate] = []
        seen_ids: set[str] = set()
        feeds = (
            ("latest", {}),
            ("top", {"top": self._top_days}),
        )

        for feed_type, base_params in feeds:
            for page in range(1, self._max_pages + 1):
                response = self._client.get(
                    _DEVTO_ARTICLES_URL,
                    params={
                        **base_params,
                        "per_page": self._page_size,
                        "page": page,
                    },
                )
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, list) or not payload:
                    break

                all_older_than_since = True
                for item in payload:
                    if not isinstance(item, dict):
                        continue

                    article_id = str(item.get("id") or "").strip()
                    if not article_id or article_id in seen_ids:
                        continue

                    published_raw = item.get("published_at") or item.get("created_at")
                    try:
                        published_at = datetime.fromisoformat(str(published_raw).replace("Z", "+00:00"))
                    except Exception:
                        published_at = datetime.now(tz=timezone.utc)

                    if published_at >= since:
                        all_older_than_since = False

                    if published_at < since:
                        continue

                    title = item.get("title") or "Dev.to mention"
                    description = item.get("description") or ""
                    tags = item.get("tag_list")
                    if isinstance(tags, list):
                        tag_text = " ".join(str(tag) for tag in tags)
                    else:
                        tag_text = str(tags or "")
                    body_markdown = str(item.get("body_markdown") or "")
                    combined_excerpt = " ".join(
                        part
                        for part in (
                            " ".join(str(description).split()),
                            " ".join(tag_text.split()),
                            " ".join(body_markdown.split()),
                        )
                        if part
                    ).strip()

                    haystack = f"{title} {description} {tag_text} {body_markdown}".casefold()
                    if normalized not in haystack:
                        continue

                    url = item.get("url")
                    if not url:
                        continue

                    user_data = item.get("user") or {}
                    results.append(
                        MentionCandidate(
                            platform="devto",
                            external_id=article_id,
                            url=url,
                            title=title.strip(),
                            body_excerpt=combined_excerpt[:500],
                            author=user_data.get("name") or user_data.get("username"),
                            community="dev.to",
                            published_at=published_at,
                            raw_payload=item,
                        )
                    )
                    seen_ids.add(article_id)

                    if len(results) >= limit:
                        return results

                if feed_type == "latest" and all_older_than_since:
                    break

        return results
