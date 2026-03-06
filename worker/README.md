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
- Effective polling cadence is plan-based by default:
  - `starter_9` ($5): every 5 hours
  - `growth_15` ($9): every 3 hours
  via `PLAN_STARTER_9_POLL_INTERVAL_MINUTES` and `PLAN_GROWTH_15_POLL_INTERVAL_MINUTES`.

## GitHub Actions + cron-jobs.org (no GitHub schedule)
Signalze can run the worker via GitHub Actions `workflow_dispatch`, with cron-jobs.org as the scheduler.

1. Configure app env vars (frontend deployment):
   - `MENTION_BOOTSTRAP_GITHUB_TOKEN`
   - `MENTION_BOOTSTRAP_GITHUB_OWNER`
   - `MENTION_BOOTSTRAP_GITHUB_REPO`
   - `MENTION_BOOTSTRAP_GITHUB_WORKFLOW=mentions-worker.yml`
   - `MENTION_BOOTSTRAP_GITHUB_REF=main`
   - `CRON_MENTIONS_TOKEN` (or reuse `MENTION_BOOTSTRAP_WEBHOOK_TOKEN`)
2. Create cron-jobs.org job:
   - URL: `https://<your-domain>/api/cron/mentions?token=<CRON_MENTIONS_TOKEN>`
   - Method: `GET` (or `POST`)
   - Schedule: every 15 minutes
3. The endpoint dispatches GitHub workflow `mentions-worker.yml`.
4. Keep `workflow_dispatch` enabled in GitHub workflow; built-in GitHub `schedule` is optional and can be disabled.

## Render setup (ready in repo)
- This repo includes [`/Users/deepmishra/vscode/signalze/render.yaml`](/Users/deepmishra/vscode/signalze/render.yaml) with a `starter` cron service:
  - schedule: every 15 minutes (`*/15 * * * *`)
  - root dir: `worker`
  - command: `python main.py`
- In Render:
  1. New -> Blueprint -> select this repo.
  2. Review the cron service `signalze-mentions-worker`.
  3. Set secrets:
     - `DATABASE_URL`
     - `GITHUB_TOKEN`
  4. Deploy.

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
- `POLL_INTERVAL_MINUTES=15` (worker execution cadence; plan intervals control per-keyword scheduling)
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
- Keyword tracking tables
- Mention dedup (`mentions` unique by `(platform, external_id)`)
- Alert dedup (`alert_deliveries` unique by `(user_id, mention_id, keyword_id, channel)`)
- Polling state (`keyword_source_state`)
- Worker run logs (`worker_runs`)
- Source enum values include `hackernews`, `devto`, `github_discussions`, plus disabled placeholders (`reddit`, `google`, `brave`, `producthunt`)

## Plan limits implemented
- `starter_9`: max **7 active keywords**
- `growth_15`: max **35 active keywords**

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
- Dev.to support is best-effort because full public query search is limited in their API. Signalze scans the real latest articles endpoint plus top feeds with bounded pagination (`DEVTO_PAGE_SIZE`, `DEVTO_MAX_PAGES`) to improve recall without unbounded API calls.
