"use client"

import Image from "next/image"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { isTrialExpired } from "@/lib/client/billing"
import {
  ACTIVE_PLATFORMS,
  PLATFORM_FILTERS,
  PLATFORM_LABELS,
  type ActivePlatform,
  type PlatformFilter,
} from "@/lib/platforms"
import {
  ensureProfile,
  getValidSession,
  listKeywords,
  type KeywordRow,
} from "@/lib/supabase-lite"

const AUTH_ENTRY_PATH = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? "/sign-in" : "/login"

type Mention = {
  platform: ActivePlatform
  externalId: string
  url: string
  title: string
  excerpt: string
  author: string | null
  community: string | null
  publishedAt: string
  matchedTerms: string[]
}

type MentionsApiResponse = {
  fetchedAt: string
  latestMatchedAt: string | null
  mentions: Mention[]
}

type MentionStatusResponse = {
  hasNew: boolean
  latestMatchedAt: string | null
}

const HISTORY_DAYS = 7
const STATUS_CHECK_INTERVAL_MS = 5 * 60_000

function formatTime(isoTime: string): string {
  const date = new Date(isoTime)
  if (Number.isNaN(date.getTime())) {
    return "Unknown time"
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function dayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatDayHeading(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date)
}

export default function DashboardPage() {
  const [activePlatform, setActivePlatform] = useState<PlatformFilter>("all")
  const [mentions, setMentions] = useState<Mention[]>([])
  const [keywordRows, setKeywordRows] = useState<KeywordRow[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshingMentions, setIsRefreshingMentions] = useState(false)
  const [hasNewMentions, setHasNewMentions] = useState(false)
  const [lastSeenMatchedAt, setLastSeenMatchedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const statusCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchMentions = useCallback(async () => {
    setError(null)
    setIsRefreshingMentions(true)

    try {
      const response = await fetch("/api/mentions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platforms: ACTIVE_PLATFORMS,
          limit: 150,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? "Failed to fetch mentions")
      }

      const payload = (await response.json()) as MentionsApiResponse
      setMentions(payload.mentions)
      setLastSeenMatchedAt(payload.latestMatchedAt ?? null)
      setHasNewMentions(false)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch mentions")
    } finally {
      setIsRefreshingMentions(false)
    }
  }, [])

  const checkForNewMentions = useCallback(async (since: string | null) => {
    try {
      const searchParams = new URLSearchParams()
      if (since) {
        searchParams.set("since", since)
      }
      const response = await fetch(`/api/mentions/status?${searchParams.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      })
      if (!response.ok) {
        return
      }
      const payload = (await response.json()) as MentionStatusResponse
      setHasNewMentions(Boolean(payload.hasNew))
    } catch {
      // Ignore transient status polling errors on dashboard.
    }
  }, [])

  useEffect(() => {
    async function bootstrap() {
      try {
        const validSession = await getValidSession()
        if (!validSession) {
          window.location.replace(AUTH_ENTRY_PATH)
          return
        }

        const profile = await ensureProfile(validSession)
        if (!profile?.plan_selected_at) {
          window.location.replace("/pricing")
          return
        }

        let trialExpired = isTrialExpired(profile.billing_mode, profile.trial_ends_at)

        // After checkout, directly confirm billing status instead of waiting for webhook
        if (trialExpired && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("checkout")) {
          try {
            const confirmRes = await fetch("/api/billing/confirm-checkout", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
            })
            if (confirmRes.ok) {
              const freshProfile = await ensureProfile(validSession)
              trialExpired = isTrialExpired(freshProfile.billing_mode, freshProfile.trial_ends_at)
            }
          } catch {
            // Continue with the stale check if confirmation fails
          }
        }

        if (trialExpired) {
          window.location.replace("/upgrade")
          return
        }

        if (!profile.onboarding_completed) {
          window.location.replace("/onboarding")
          return
        }

        const keywords = await listKeywords(validSession)
        setKeywordRows(keywords)
        await fetchMentions()
      } catch (bootstrapError) {
        const message = bootstrapError instanceof Error ? bootstrapError.message : "Failed to load dashboard"
        if (message.toLowerCase().includes("trial has ended")) {
          window.location.replace("/upgrade")
          return
        }
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }

    void bootstrap()
  }, [fetchMentions])

  useEffect(() => {
    if (isLoading || isRefreshingMentions) {
      return
    }
    void checkForNewMentions(lastSeenMatchedAt)
  }, [checkForNewMentions, isLoading, isRefreshingMentions, lastSeenMatchedAt])

  useEffect(() => {
    if (isLoading) {
      return
    }

    if (statusCheckIntervalRef.current) {
      clearInterval(statusCheckIntervalRef.current)
    }

    statusCheckIntervalRef.current = setInterval(() => {
      void checkForNewMentions(lastSeenMatchedAt)
    }, STATUS_CHECK_INTERVAL_MS)

    return () => {
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current)
      }
    }
  }, [checkForNewMentions, isLoading, lastSeenMatchedAt])

  const filteredMentions = useMemo(() => {
    if (activePlatform === "all") {
      return mentions
    }
    return mentions.filter((mention) => mention.platform === activePlatform)
  }, [mentions, activePlatform])

  const activeKeywords = useMemo(() => keywordRows.filter((item) => item.is_active), [keywordRows])

  const counts = useMemo(() => {
    const byPlatform = Object.fromEntries(
      ACTIVE_PLATFORMS.map((platform) => [platform, 0]),
    ) as Record<ActivePlatform, number>
    for (const mention of mentions) {
      byPlatform[mention.platform] += 1
    }
    return {
      total: mentions.length,
      byPlatform,
    }
  }, [mentions])

  const mentionTimeline = useMemo(() => {
    const now = new Date()
    const todayStart = startOfLocalDay(now)
    const cutoff = new Date(todayStart)
    cutoff.setDate(cutoff.getDate() - HISTORY_DAYS)

    const recent = filteredMentions.filter((mention) => {
      const publishedAt = new Date(mention.publishedAt)
      return !Number.isNaN(publishedAt.getTime()) && publishedAt >= cutoff
    })

    const today: Mention[] = []
    const byDay = new Map<string, Mention[]>()

    for (const mention of recent) {
      const published = new Date(mention.publishedAt)
      if (Number.isNaN(published.getTime())) {
        continue
      }

      const key = dayKey(startOfLocalDay(published))
      if (key === dayKey(todayStart)) {
        today.push(mention)
        continue
      }

      const bucket = byDay.get(key)
      if (bucket) {
        bucket.push(mention)
      } else {
        byDay.set(key, [mention])
      }
    }

    const previousDays = Array.from({ length: HISTORY_DAYS }, (_, index) => {
      const dayDate = new Date(todayStart)
      dayDate.setDate(dayDate.getDate() - (index + 1))
      const key = dayKey(dayDate)
      return {
        key,
        label: formatDayHeading(dayDate),
        mentions: byDay.get(key) ?? [],
      }
    })

    return {
      today,
      previousDays,
      hasAny: today.length > 0 || previousDays.some((item) => item.mentions.length > 0),
    }
  }, [filteredMentions])

  async function handleLogout() {
    const clerk = (window as { Clerk?: { signOut?: (options?: { redirectUrl?: string }) => Promise<void> } }).Clerk
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined)
    if (clerk?.signOut) {
      await clerk.signOut().catch(() => undefined)
    }
    window.location.replace("/")
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6 md:py-12">
        <div className="mx-auto w-full max-w-3xl p-6 text-sm text-muted-foreground">Loading dashboard...</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 md:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="p-2 sm:p-3">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="inline-flex items-center gap-3" aria-label="Signalze home">
              <Image
                src="/logo.png"
                alt="Signalze"
                width={640}
                height={640}
                className="h-9 w-9 rounded-md object-cover"
                priority
              />
              <span className="font-serif text-xl font-bold text-foreground sm:text-2xl">signalze</span>
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/settings"
                aria-label="Open settings"
                title="Open settings"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/40 text-foreground transition-colors hover:opacity-80"
              >
                <SettingsIcon />
              </Link>
              <button
                onClick={() => void handleLogout()}
                aria-label="Sign out"
                title="Sign out"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/40 text-muted-foreground transition-colors hover:text-foreground"
              >
                <SignOutIcon />
              </button>
            </div>
          </div>
        </header>

        <section className="p-2 sm:p-3">
          <h2 className="font-handwriting text-3xl text-card-foreground">Tracking now</h2>
          <div className="mt-3">
            <p className="text-xs font-medium text-muted-foreground">Keywords</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {activeKeywords.length ? (
                activeKeywords.map((keyword) => (
                  <span key={keyword.id} className="max-w-full break-all rounded-full border border-border/40 px-3 py-1 text-xs text-foreground">
                    {keyword.query}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">No active keywords</span>
              )}
            </div>
          </div>
        </section>

        <section className="p-2 sm:p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-handwriting text-3xl text-card-foreground">Mentions</h2>
            <div className="flex flex-col items-start gap-1 sm:items-end">
              {hasNewMentions ? (
                <button
                  onClick={() => void fetchMentions()}
                  disabled={isRefreshingMentions}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-border/40 px-6 text-sm font-semibold text-foreground transition-all hover:opacity-80 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isRefreshingMentions ? "Refreshing..." : "Refresh feed"}
                </button>
              ) : (
                <span className="inline-flex h-10 items-center justify-center rounded-full border border-border/30 px-6 text-sm text-muted-foreground">
                  Refreshed
                </span>
              )}
            </div>
          </div>

          {error ? (
            <p className="mt-3 rounded-xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{error}</p>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total" value={counts.total} />
            {ACTIVE_PLATFORMS.map((platform) => (
              <StatCard key={platform} label={PLATFORM_LABELS[platform]} value={counts.byPlatform[platform]} />
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {PLATFORM_FILTERS.map((platform) => (
              <button
                key={platform}
                onClick={() => setActivePlatform(platform)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                  activePlatform === platform
                    ? "border border-border/50 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {platform === "all" ? "All" : PLATFORM_LABELS[platform]}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-6">
            <section className="rounded-2xl border border-border/50 bg-secondary/25 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Today</h3>
              {mentionTimeline.today.length ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {mentionTimeline.today.map((mention) => (
                    <MentionCard key={`${mention.platform}:${mention.externalId}`} mention={mention} />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No mentions today yet.</p>
              )}
            </section>

            {mentionTimeline.previousDays.map((day) => (
              <section key={day.key} className="rounded-2xl border border-border/40 p-4">
                <h3 className="text-sm font-semibold text-muted-foreground">{day.label}</h3>
                {day.mentions.length ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {day.mentions.map((mention) => (
                      <MentionCard key={`${mention.platform}:${mention.externalId}`} mention={mention} />
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No mentions.</p>
                )}
              </section>
            ))}
          </div>

          {!mentionTimeline.hasAny ? (
            <p className="mt-5 rounded-xl border border-dashed border-border/40 p-8 text-center text-sm text-muted-foreground">
              No mentions yet. New mentions appear after the worker refresh cycle.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317a1.724 1.724 0 0 1 3.35 0 1.724 1.724 0 0 0 2.573 1.066 1.724 1.724 0 0 1 2.3 2.3 1.724 1.724 0 0 0 1.066 2.573 1.724 1.724 0 0 1 0 3.35 1.724 1.724 0 0 0-1.066 2.573 1.724 1.724 0 0 1-2.3 2.3 1.724 1.724 0 0 0-2.573 1.066 1.724 1.724 0 0 1-3.35 0 1.724 1.724 0 0 0-2.573-1.066 1.724 1.724 0 0 1-2.3-2.3 1.724 1.724 0 0 0-1.066-2.573 1.724 1.724 0 0 1 0-3.35 1.724 1.724 0 0 0 1.066-2.573 1.724 1.724 0 0 1 2.3-2.3 1.724 1.724 0 0 0 2.573-1.066z"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 12h10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m17 9 3 3-3 3" />
    </svg>
  )
}

function StatCard({
  label,
  value,
}: {
  label: string
  value: number
}) {
  return (
    <div className="px-1 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-2xl text-foreground">{value}</p>
    </div>
  )
}

function MentionCard({ mention }: { mention: Mention }) {
  return (
    <article className="rounded-xl border border-border/40 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="rounded-full border border-border/40 px-2.5 py-1 text-xs font-semibold text-foreground">
          {PLATFORM_LABELS[mention.platform]}
        </span>
        <span className="text-xs text-muted-foreground">{formatTime(mention.publishedAt)}</span>
      </div>

      <a
        href={mention.url}
        target="_blank"
        rel="noreferrer"
        className="line-clamp-2 text-base font-semibold text-foreground hover:underline"
      >
        {mention.title}
      </a>

      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{mention.excerpt || "No excerpt available."}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{mention.community ?? "Unknown community"}</span>
        <span>•</span>
        <span>{mention.author ?? "Unknown author"}</span>
      </div>

      {mention.matchedTerms.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {mention.matchedTerms.map((term) => (
            <span
              key={term}
              className="max-w-full break-all rounded-full border border-border/40 px-2.5 py-0.5 text-[11px] font-medium text-foreground"
            >
              {term}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  )
}
