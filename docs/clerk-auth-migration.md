# Clerk + Supabase (DB-only) migration notes

This repo now supports Clerk-authenticated sessions while keeping legacy Supabase-auth sessions working during transition.

## What changed

- API auth guard (`frontend/lib/server/authz.ts`) now accepts:
  - Clerk session token (preferred), or
  - legacy `signalze_session` cookie (fallback).
- New Clerk routes:
  - `/sign-in`
  - `/sign-up`
- Protected-route middleware accepts either:
  - `__session` (Clerk), or
  - `signalze_session` (legacy).
- `/login` forwards to Clerk sign-in when Clerk env vars are present.
- Profile bootstrap now supports non-UUID auth subjects via `profiles.clerk_user_id`.
- Supabase schema supports Clerk identity mapping via new migration.

## Required env vars

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- existing Supabase vars remain required for DB access (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, etc.)

## Install dependency

```bash
cd frontend
npm install @clerk/nextjs
```

## Required SQL migration

Apply:

- `supabase/migrations/resolve_advisors.sql`
- `supabase/migrations/zz_clerk_auth_support.sql`

`zz_clerk_auth_support.sql` does the critical DB-only auth changes:

- drops `profiles -> auth.users` hard FK
- adds `profiles.clerk_user_id`
- adds helper funcs for JWT-sub to profile-id mapping
- updates RLS policies to support both legacy `auth.uid()` and Clerk-mapped profile IDs

## Supabase + Clerk integration

In Supabase and Clerk dashboards, configure third-party JWT integration so Clerk session tokens are accepted by Supabase RLS.

If this integration is not configured, API calls with Clerk sessions will be unauthorized.
