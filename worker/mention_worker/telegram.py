from __future__ import annotations

from datetime import timezone

import html
import httpx

from mention_worker.models import MatchedMention, TelegramSubscription
from mention_worker.sources.registry import source_label


def build_telegram_digest(
    subscription: TelegramSubscription,
    mentions: list[MatchedMention],
) -> str:
    shown_mentions = mentions[:20]
    filters = [
        f"keyword={subscription.keyword_filter or 'all'}",
        f"platform={source_label(subscription.platform_filter) if subscription.platform_filter else 'all'}",
    ]

    lines = [
        "<b>Signalze update</b>",
        f"Filters: {html.escape(', '.join(filters))}",
        f"New mentions: {len(mentions)}",
        "",
    ]

    for index, matched in enumerate(shown_mentions, start=1):
        mention = matched.mention
        published = mention.published_at.astimezone(timezone.utc).strftime("%b %d %H:%M UTC")
        title = html.escape((mention.title or "Mention").replace("\n", " ").strip()[:110])
        lines.append(f"{index}. <b>[{html.escape(source_label(mention.platform))}]</b> <a href=\"{html.escape(mention.url)}\">{title}</a>")
        lines.append(f"Keyword: {html.escape(matched.query)} · {published}")
        lines.append("")

    if len(mentions) > len(shown_mentions):
        lines.append(f"<i>{len(mentions) - len(shown_mentions)} more mention(s) are available. Use /latest 100 in Telegram.</i>")

    return "\n".join(lines)[:3900]


def send_telegram_digest(
    client: httpx.Client,
    *,
    bot_token: str,
    subscription: TelegramSubscription,
    mentions: list[MatchedMention],
) -> None:
    payload = {
        "chat_id": subscription.chat_id,
        "text": build_telegram_digest(subscription, mentions),
        "disable_web_page_preview": True,
        "parse_mode": "HTML",
    }
    response = client.post(f"https://api.telegram.org/bot{bot_token}/sendMessage", json=payload)
    response.raise_for_status()
