from __future__ import annotations

from datetime import timezone

import httpx

from mention_worker.models import PendingAlert
from mention_worker.sources.registry import source_label


def build_slack_payload(alert: PendingAlert) -> dict:
    mention = alert.mention
    platform = source_label(mention.platform)

    published = mention.published_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    summary = mention.body_excerpt.strip() or "No preview text available."
    summary = summary[:280]

    return {
        "text": f"New {platform} mention for '{alert.query}'",
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"New {platform} mention",
                },
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Keyword*\n{alert.query}"},
                    {"type": "mrkdwn", "text": f"*Source*\n{platform}"},
                    {"type": "mrkdwn", "text": f"*Published*\n{published}"},
                ],
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*{mention.title}*\n{summary}",
                },
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "Open mention"},
                        "url": mention.url,
                    }
                ],
            },
        ],
    }


def send_slack_alert(client: httpx.Client, *, webhook_url: str, alert: PendingAlert) -> None:
    payload = build_slack_payload(alert)
    response = client.post(webhook_url, json=payload)
    response.raise_for_status()
