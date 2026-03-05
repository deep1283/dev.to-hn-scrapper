from __future__ import annotations

from datetime import datetime, timedelta, timezone
import unittest

from mention_worker.sources.devto import DevToSource


class _FakeResponse:
    def __init__(self, payload: list[dict]) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> list[dict]:
        return self._payload


class _FakeClient:
    def __init__(self, responses: dict[tuple[str, int], list[dict]]) -> None:
        self._responses = responses
        self.calls: list[dict] = []

    def get(self, url: str, *, params: dict) -> _FakeResponse:
        self.calls.append({"url": url, "params": dict(params)})
        feed = "top" if "top" in params else "latest"
        page = int(params.get("page", 1))
        return _FakeResponse(self._responses.get((feed, page), []))


class DevToSourceTests(unittest.TestCase):
    def test_search_scans_multiple_pages(self) -> None:
        now = datetime.now(tz=timezone.utc)
        since = now - timedelta(days=1)
        responses = {
            ("latest", 1): [
                {
                    "id": 101,
                    "url": "https://dev.to/a",
                    "title": "General post",
                    "description": "nothing relevant",
                    "tag_list": ["general"],
                    "published_at": now.isoformat(),
                }
            ],
            ("latest", 2): [
                {
                    "id": 202,
                    "url": "https://dev.to/b",
                    "title": "Another post",
                    "description": "still generic",
                    "body_markdown": "signalze mentioned in body",
                    "tag_list": ["backend"],
                    "published_at": now.isoformat(),
                    "user": {"username": "writer"},
                }
            ],
        }
        source = DevToSource(_FakeClient(responses), top_days=7, page_size=20, max_pages=2)

        results = source.search("signalze", since=since, limit=10)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].external_id, "202")
        self.assertEqual(results[0].author, "writer")

    def test_search_dedupes_between_latest_and_top(self) -> None:
        now = datetime.now(tz=timezone.utc)
        since = now - timedelta(days=2)
        repeated = {
            "id": 303,
            "url": "https://dev.to/repeated",
            "title": "Signalze launch",
            "description": "Signalze feedback",
            "tag_list": ["signalze"],
            "published_at": now.isoformat(),
        }
        responses = {
            ("latest", 1): [repeated],
            ("latest", 2): [],
            ("top", 1): [
                repeated,
                {
                    "id": 404,
                    "url": "https://dev.to/new",
                    "title": "Signalze use cases",
                    "description": "notes",
                    "tag_list": ["product"],
                    "published_at": now.isoformat(),
                },
            ],
            ("top", 2): [],
        }
        source = DevToSource(_FakeClient(responses), top_days=7, page_size=50, max_pages=2)

        results = source.search("signalze", since=since, limit=10)

        self.assertEqual(len(results), 2)
        self.assertEqual(results[0].external_id, "303")
        self.assertEqual(results[1].external_id, "404")


if __name__ == "__main__":
    unittest.main()
