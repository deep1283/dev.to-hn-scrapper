# Mention Tracker Worker (Railway)

This worker polls Hacker News, GitHub Discussions, and Dev.to for active tracking queries, deduplicates mentions, and sends Slack webhook alerts.

Current fetch strategy:
- Initial backfill per source+query: last 7 days (`INITIAL_BACKFILL_DAYS`).
- Subsequent refresh: incremental window (default 24h) with overlap.
- Query-level cache: repeated identical queries reuse cached DB mentions until per-source TTL expires.
- Retention: mentions older than `MENTION_RETENTION_DAYS` are deleted each run.

## Source registry (plug-and-play setup)
- Source metadata and adapter wiring are centralized in [`/Users/deepmishra/vscode/signalze/worker/mention_worker/sources/registry.py`](/Users/deepmishra/vscode/signalze/worker/mention_worker/sources/registry.py).
- To add a future source (for example Google, Brave, Product Hunt):
  1. Add an adapter in `worker/mention_worker/sources/`.
  2. Add one `SourceDefinition` entry with its builder in `registry.py`.
  3. Set env flags (`SOURCE_<SLUG>_ENABLED`, poll interval, daily cap) and enable rows in `keyword_sources`.

## Why Python on Railway?
Python is a good fit for this workload because polling, normalization, retries, and outbound webhook delivery are straightforward and reliable with small operational overhead.

## Runtime model
- Deploy this folder as a Railway service.
- Run it as a **Cron job every 10-15 minutes**.
- Command: `python main.py`

## Free-tier-safe mode (recommended for MVP)
Keep request volume conservative until you have paid customers.

Suggested env values:
- `FREE_TIER_MODE=true`
- `SOURCE_HN_ENABLED=true`
- `SOURCE_DEVTO_ENABLED=true`
- `SOURCE_GITHUB_DISCUSSIONS_ENABLED=true`
- `SOURCE_HN_POLL_INTERVAL_MINUTES=360` (6 hours)
- `SOURCE_DEVTO_POLL_INTERVAL_MINUTES=720` (12 hours)
- `SOURCE_GITHUB_DISCUSSIONS_POLL_INTERVAL_MINUTES=360` (6 hours)
- `SOURCE_HN_QUERY_CACHE_TTL_MINUTES=20`
- `SOURCE_DEVTO_QUERY_CACHE_TTL_MINUTES=30`
- `SOURCE_GITHUB_DISCUSSIONS_QUERY_CACHE_TTL_MINUTES=60`
- `SOURCE_HN_INCREMENTAL_LOOKBACK_HOURS=24`
- `SOURCE_DEVTO_INCREMENTAL_LOOKBACK_HOURS=24`
- `SOURCE_GITHUB_DISCUSSIONS_INCREMENTAL_LOOKBACK_HOURS=24`
- `POLL_INTERVAL_MINUTES=15` (worker can still run often; source intervals gate calls)
- `MENTION_RETENTION_DAYS=7`
- `INITIAL_BACKFILL_DAYS=7`
- `SOURCE_REDDIT_ENABLED=false`
- `SOURCE_GOOGLE_ENABLED=false`
- `SOURCE_BRAVE_ENABLED=false`
- `SOURCE_PRODUCTHUNT_ENABLED=false`

When `FREE_TIER_MODE=true`, the worker auto-applies conservative daily source request caps if you do not set explicit limits:
- Hacker News: 2000/day
- Dev.to: 1000/day
- GitHub Discussions: 1000/day
- Reddit: 500/day (unused in v1)
- Google: 100/day (unused in v1)
- Brave: 1000/day (unused in v1)
- Product Hunt: 500/day (unused in v1)

## Required database schema
Apply [`/Users/deepmishra/vscode/signalze/supabase/schema.sql`](/Users/deepmishra/vscode/signalze/supabase/schema.sql) first.

The schema includes:
- Plan limits (`starter_9`, `growth_15`)
- Brand and keyword tracking tables
- Mention dedup (`mentions` unique by `(platform, external_id)`)
- Alert dedup (`alert_deliveries` unique by `(user_id, mention_id, keyword_id, channel)`)
- Polling state (`keyword_source_state`)
- Worker run logs (`worker_runs`)
- Source enum values include `hackernews`, `devto`, `github_discussions`, plus disabled placeholders (`reddit`, `google`, `brave`, `producthunt`)

## Plan limits implemented
- `starter_9`: max **1 active brand**, max **7 active user keywords**
- `growth_15`: max **multiple brands** (unbounded in schema), max **35 active user keywords**

Brand names are tracked automatically via system keywords, and system keywords do not consume the user keyword quota.

## Environment variables
Copy [`/Users/deepmishra/vscode/signalze/worker/.env.example`](/Users/deepmishra/vscode/signalze/worker/.env.example) and set values in Railway.

Minimum required:
- `DATABASE_URL`
- `GITHUB_TOKEN` (required when GitHub Discussions source is enabled)

## Local run
```bash
cd /Users/deepmishra/vscode/signalze/worker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

## Notes
- Use Supabase service-level DB credentials for `DATABASE_URL`.
- `slack_webhook_url_enc` is treated as raw webhook URL by this scaffold. If you store encrypted values, decrypt before sending or add a decryption layer in worker code.
- Dev.to support is best-effort because full public query search is limited in their API.
