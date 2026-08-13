# Signalze — Brand Mention Monitoring

Signalze is a full-stack monitoring product for tracking keyword and brand mentions across developer and community platforms. It combines a Next.js application, a Python polling worker, Supabase persistence, and Slack/Telegram delivery to turn external discussion into actionable alerts.

> This repository retains its original GitHub name, `dev.to-hn-scrapper`, but the product in the codebase is Signalze.

## What it does

- Tracks user-defined keywords across Hacker News, Dev.to, and GitHub Discussions
- Uses an extensible source registry for additional providers such as Reddit
- Deduplicates mentions and alert deliveries at the database layer
- Uses per-source request budgets, query caching, overlap windows, retention, and advisory locks to keep polling reliable and cost-aware
- Delivers alerts through Slack webhooks and Telegram digests
- Includes a responsive dashboard, onboarding, authentication, subscription, and integration flows

## Architecture

```text
Next.js dashboard + API routes
            ↓
Supabase (profiles, keywords, mentions, polling state, alert state)
            ↑
Python worker (poll → normalize → dedupe → persist → alert)
            ↓
Hacker News · Dev.to · GitHub Discussions
```

## Stack

- **Frontend:** TypeScript, Next.js 16, React 19, Tailwind CSS, Clerk, Supabase
- **Worker:** Python, httpx, PostgreSQL, Railway-compatible cron execution
- **Data:** Supabase/Postgres migrations, source-query cache, advisory locks, deduplication constraints
- **Integrations:** Slack, Telegram, GitHub Actions workflow dispatch

## Repository layout

```text
frontend/  # Next.js product, dashboard, API routes, auth, billing, integrations
worker/    # Python polling and alerting service
supabase/  # schema, migrations, and security hardening
docs/      # implementation notes and migration documentation
```

## Run locally

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Worker

```bash
cd worker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

The worker requires a Postgres/Supabase database URL. Enable only the source integrations for which you have configured credentials. See [`worker/README.md`](worker/README.md) for deployment, scheduling, environment variables, and free-tier request-budget guidance.

## Reliability notes

The worker intentionally groups repeated keyword queries, caches fresh source results, tracks request budgets, and uses database advisory locks. These controls prevent redundant upstream calls and duplicate alerts when multiple jobs overlap.

## Validation

```bash
cd frontend && npm run lint && npm run build
cd worker && python -m unittest discover -s tests
```

## Status

Signalze is an active product prototype. Before production rollout, configure secrets in your deployment platform, apply the Supabase migrations, and confirm provider-specific API limits and policies.
