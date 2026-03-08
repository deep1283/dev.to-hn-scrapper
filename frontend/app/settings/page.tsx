"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { PLAN_CONFIG, type PlanId } from "@/lib/plans"
import {
  bootstrapKeywordMentions,
  getSettingsBootstrap,
  insertKeyword,
  updateKeyword,
  type BillingMode,
  type KeywordRow,
  type SessionData,
} from "@/lib/supabase-lite"

const AUTH_ENTRY_PATH = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? "/sign-in" : "/login"

function cleanInput(input: string): string {
  return input.trim().replace(/\s+/g, " ")
}

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

type SlackStatusResponse = {
  connected?: boolean
  webhookHint?: string | null
  canUseSlack?: boolean
}

type SlackMutationResponse = {
  connected?: boolean
  webhookHint?: string | null
  message?: string
}

type TelegramStatusResponse = {
  configured?: boolean
  connected?: boolean
  alertsEnabled?: boolean
  paused?: boolean
  keywordFilter?: string | null
  platformFilter?: string | null
}

type TelegramConnectResponse = TelegramStatusResponse & {
  botUsername?: string | null
  botLink?: string | null
  startCode?: string | null
  linkExpiresAt?: string | null
  message?: string
}

async function parseApiError(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null
  return payload?.error ?? fallback
}

export default function SettingsPage() {
  const [session, setSession] = useState<SessionData | null>(null)
  const [plan, setPlan] = useState<PlanId>("starter_9")
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null)
  const [pendingPlanEffectiveAt, setPendingPlanEffectiveAt] = useState<string | null>(null)
  const [billing, setBilling] = useState<BillingMode>("trial")
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null)

  const [keywordInput, setKeywordInput] = useState("")
  const [keywordRows, setKeywordRows] = useState<KeywordRow[]>([])
  const [hasPendingKeywordBootstrap, setHasPendingKeywordBootstrap] = useState(false)

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isKeywordBootstrapping, setIsKeywordBootstrapping] = useState(false)
  const [isSlackSaving, setIsSlackSaving] = useState(false)
  const [isSlackTesting, setIsSlackTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slackFeedback, setSlackFeedback] = useState<string | null>(null)
  const [slackConnected, setSlackConnected] = useState(false)
  const [slackWebhookHint, setSlackWebhookHint] = useState<string | null>(null)
  const [slackWebhookInput, setSlackWebhookInput] = useState("")
  const [telegramConfigured, setTelegramConfigured] = useState(false)
  const [telegramConnected, setTelegramConnected] = useState(false)
  const [telegramAlertsEnabled, setTelegramAlertsEnabled] = useState(true)
  const [telegramPaused, setTelegramPaused] = useState(false)
  const [telegramKeywordFilter, setTelegramKeywordFilter] = useState<string | null>(null)
  const [telegramPlatformFilter, setTelegramPlatformFilter] = useState<string | null>(null)
  const [telegramBotUsername, setTelegramBotUsername] = useState<string | null>(null)
  const [telegramStartCode, setTelegramStartCode] = useState<string | null>(null)
  const [telegramLinkExpiresAt, setTelegramLinkExpiresAt] = useState<string | null>(null)
  const [telegramFeedback, setTelegramFeedback] = useState<string | null>(null)
  const [isTelegramSaving, setIsTelegramSaving] = useState(false)

  useEffect(() => {
    async function bootstrap() {
      try {
        const payload = await getSettingsBootstrap()
        if (payload.nextRoute !== "/settings") {
          window.location.replace(payload.nextRoute === "/login" ? AUTH_ENTRY_PATH : payload.nextRoute)
          return
        }

        const validSession = { user: payload.user }
        setSession(validSession)
        const profile = payload.profile

        setPlan(profile.plan_tier)
        setPendingPlan(profile.pending_plan_tier)
        setPendingPlanEffectiveAt(profile.pending_plan_effective_at)
        setBilling(profile.billing_mode ?? "trial")
        setTrialEndsAt(profile.trial_ends_at ?? null)
        setKeywordRows(payload.keywords)
        setSlackConnected(Boolean(payload.slack.connected))
        setSlackWebhookHint(payload.slack.webhookHint ?? null)
        setTelegramConfigured(Boolean(payload.telegram?.configured))
        setTelegramConnected(Boolean(payload.telegram?.connected))
        setTelegramAlertsEnabled(payload.telegram?.alertsEnabled ?? true)
        setTelegramPaused(Boolean(payload.telegram?.paused))
        setTelegramKeywordFilter(payload.telegram?.keywordFilter ?? null)
        setTelegramPlatformFilter(payload.telegram?.platformFilter ?? null)
      } catch (bootstrapError) {
        const message = bootstrapError instanceof Error ? bootstrapError.message : "Failed to load settings"
        if (message.toLowerCase().includes("please log in")) {
          window.location.replace(AUTH_ENTRY_PATH)
          return
        }
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
  }, [])

  const planConfig = PLAN_CONFIG[plan]
  const activeKeywords = useMemo(() => keywordRows.filter((item) => item.is_active), [keywordRows])

  const overKeywordCount = Math.max(0, activeKeywords.length - planConfig.maxKeywords)
  const isOverPlanLimits = overKeywordCount > 0

  const keywordLimitReached = activeKeywords.length >= planConfig.maxKeywords
  const canUseSlack = plan === "growth_15"
  const showBootstrapLoading = isLoading && !session && !error

  async function addKeyword() {
    if (!session || keywordLimitReached) {
      return
    }

    setError(null)
    const normalized = cleanInput(keywordInput)
    if (!normalized) {
      return
    }

    const existing = keywordRows.find((keyword) => keyword.query.toLowerCase() === normalized.toLowerCase())
    if (existing?.is_active) {
      setKeywordInput("")
      return
    }

    setIsSaving(true)
    try {
      if (existing) {
        const updated = await updateKeyword(session, existing.id, { is_active: true, query: normalized })
        if (updated) {
          setKeywordRows((current) => current.map((row) => (row.id === updated.id ? updated : row)))
        }
      } else {
        const inserted = await insertKeyword(session, normalized, { deferBootstrap: true })
        setKeywordRows((current) => [...current, inserted])
      }
      setHasPendingKeywordBootstrap(true)
      setKeywordInput("")
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Failed to add keyword")
    } finally {
      setIsSaving(false)
    }
  }

  async function finalizeKeywordChanges() {
    if (!session || !hasPendingKeywordBootstrap) {
      return
    }

    setError(null)
    setIsKeywordBootstrapping(true)
    try {
      await bootstrapKeywordMentions()
      setHasPendingKeywordBootstrap(false)
    } catch (bootstrapError) {
      setError(bootstrapError instanceof Error ? bootstrapError.message : "Failed to refresh mentions for new keywords.")
    } finally {
      setIsKeywordBootstrapping(false)
    }
  }


  async function removeKeyword(keyword: KeywordRow) {
    if (!session) {
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const updated = await updateKeyword(session, keyword.id, { is_active: false })
      if (updated) {
        setKeywordRows((current) => current.map((row) => (row.id === updated.id ? updated : row)))
      }
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Failed to remove keyword")
    } finally {
      setIsSaving(false)
    }
  }

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

  async function refreshSlackStatus() {
    const response = await fetch("/api/integrations/slack", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(await parseApiError(response, "Unable to load Slack status."))
    }

    const payload = (await response.json()) as SlackStatusResponse
    setSlackConnected(Boolean(payload.connected))
    setSlackWebhookHint(payload.webhookHint ?? null)
  }

  async function connectSlack() {
    if (!canUseSlack) {
      setSlackFeedback("Slack updates are available on Pro plan.")
      return
    }

    setError(null)
    setSlackFeedback(null)
    const webhookUrl = cleanInput(slackWebhookInput)
    if (!webhookUrl) {
      setSlackFeedback("Enter your Slack incoming webhook URL.")
      return
    }

    setIsSlackSaving(true)
    try {
      const response = await fetch("/api/integrations/slack", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ webhookUrl }),
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Unable to connect Slack updates."))
      }

      const payload = (await response.json()) as SlackMutationResponse
      setSlackConnected(Boolean(payload.connected))
      setSlackWebhookHint(payload.webhookHint ?? null)
      setSlackWebhookInput("")
      setSlackFeedback(payload.message ?? "Slack updates connected.")
    } catch (slackError) {
      setSlackFeedback(slackError instanceof Error ? slackError.message : "Unable to connect Slack updates.")
    } finally {
      setIsSlackSaving(false)
    }
  }

  async function connectTelegram() {
    setError(null)
    setTelegramFeedback(null)
    setIsTelegramSaving(true)
    try {
      const response = await fetch("/api/integrations/telegram", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Unable to prepare Telegram connection."))
      }

      const payload = (await response.json()) as TelegramConnectResponse
      setTelegramConfigured(Boolean(payload.configured))
      setTelegramConnected(Boolean(payload.connected))
      setTelegramAlertsEnabled(payload.alertsEnabled ?? true)
      setTelegramPaused(Boolean(payload.paused))
      setTelegramKeywordFilter(payload.keywordFilter ?? null)
      setTelegramPlatformFilter(payload.platformFilter ?? null)
      setTelegramBotUsername(payload.botUsername ?? null)
      setTelegramStartCode(payload.startCode ?? null)
      setTelegramLinkExpiresAt(payload.linkExpiresAt ?? null)
      setTelegramFeedback(payload.message ?? "Telegram connection is ready.")

      if (payload.botLink) {
        window.location.assign(payload.botLink)
      }
    } catch (telegramError) {
      setTelegramFeedback(telegramError instanceof Error ? telegramError.message : "Unable to prepare Telegram connection.")
    } finally {
      setIsTelegramSaving(false)
    }
  }

  async function disconnectTelegram() {
    setError(null)
    setTelegramFeedback(null)
    setIsTelegramSaving(true)
    try {
      const response = await fetch("/api/integrations/telegram", {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Unable to disconnect Telegram."))
      }

      const payload = (await response.json()) as TelegramConnectResponse
      setTelegramConfigured(Boolean(payload.configured))
      setTelegramConnected(Boolean(payload.connected))
      setTelegramAlertsEnabled(payload.alertsEnabled ?? true)
      setTelegramPaused(Boolean(payload.paused))
      setTelegramKeywordFilter(payload.keywordFilter ?? null)
      setTelegramPlatformFilter(payload.platformFilter ?? null)
      setTelegramStartCode(null)
      setTelegramLinkExpiresAt(null)
      setTelegramFeedback(payload.message ?? "Telegram disconnected.")
    } catch (telegramError) {
      setTelegramFeedback(telegramError instanceof Error ? telegramError.message : "Unable to disconnect Telegram.")
    } finally {
      setIsTelegramSaving(false)
    }
  }

  async function disconnectSlack() {
    setError(null)
    setSlackFeedback(null)
    setIsSlackSaving(true)
    try {
      const response = await fetch("/api/integrations/slack", {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Unable to disconnect Slack updates."))
      }

      const payload = (await response.json()) as SlackMutationResponse
      setSlackConnected(Boolean(payload.connected))
      setSlackWebhookHint(payload.webhookHint ?? null)
      setSlackFeedback(payload.message ?? "Slack updates disconnected.")
    } catch (slackError) {
      setSlackFeedback(slackError instanceof Error ? slackError.message : "Unable to disconnect Slack updates.")
    } finally {
      setIsSlackSaving(false)
    }
  }

  async function sendSlackTest() {
    if (!canUseSlack) {
      setSlackFeedback("Slack updates are available on Pro plan.")
      return
    }

    setError(null)
    setSlackFeedback(null)
    setIsSlackTesting(true)
    try {
      const response = await fetch("/api/integrations/slack/test", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Unable to send Slack test alert."))
      }

      const payload = (await response.json()) as { message?: string }
      setSlackFeedback(payload.message ?? "Test alert sent to Slack.")
      await refreshSlackStatus()
    } catch (slackError) {
      setSlackFeedback(slackError instanceof Error ? slackError.message : "Unable to send Slack test alert.")
    } finally {
      setIsSlackTesting(false)
    }
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
                href="/dashboard"
                className="hidden h-10 items-center justify-center rounded-full border border-border/40 px-4 text-sm font-medium text-foreground transition-opacity hover:opacity-80 md:inline-flex"
              >
                Back to dashboard
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
          <Link
            href="/dashboard"
            className="mt-3 inline-flex h-9 items-center justify-center rounded-full border border-border/40 px-3 text-xs font-medium text-foreground transition-opacity hover:opacity-80 md:hidden"
          >
            Back to dashboard
          </Link>
        </header>

        <section className="p-2 sm:p-3">
          <h1 className="font-handwriting text-3xl text-card-foreground sm:text-4xl">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your plan and keywords.</p>

          {error ? <p className="mt-4 rounded-xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{error}</p> : null}
          {pendingPlan && pendingPlanEffectiveAt ? (
            <p className="mt-4 rounded-xl border border-border/40 px-4 py-2.5 text-sm text-foreground">
              Downgrade scheduled to {PLAN_CONFIG[pendingPlan].name} on {formatTime(pendingPlanEffectiveAt)}.
              Your current limits stay active until then.
            </p>
          ) : null}
          {isOverPlanLimits ? (
            <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3">
              <p className="text-sm font-medium text-destructive">
                You&apos;re over your new plan limits. Remove extra items to continue.
              </p>
              <p className="mt-1 text-xs text-destructive/90">
                {overKeywordCount > 0
                  ? `${overKeywordCount} keyword${overKeywordCount > 1 ? "s" : ""} over limit`
                  : "Keyword limit OK"}
              </p>

              <div className="mt-4">
                <p className="text-xs font-medium text-foreground">Keywords to adjust</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeKeywords.map((keyword) => (
                    <button
                      key={keyword.id}
                      onClick={() => void removeKeyword(keyword)}
                      className="group max-w-full break-all rounded-full border border-border/40 bg-background px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:text-destructive"
                    >
                      {keyword.query} <span className="opacity-50 group-hover:opacity-100">×</span>
                    </button>
                  ))}
                  {!activeKeywords.length ? <span className="text-xs text-muted-foreground">No active keywords.</span> : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex max-w-4xl flex-col gap-10">
            {showBootstrapLoading ? (
              <>
                <section>
                  <Skeleton className="h-9 w-36" />
                  <Skeleton className="mt-2 h-4 w-24" />
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:max-w-xs">
                    <div>
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="mt-2 h-9 w-20" />
                    </div>
                  </div>
                  <Skeleton className="mt-4 h-4 w-40" />
                  <Skeleton className="mt-2 h-4 w-48" />
                  <Skeleton className="mt-5 h-10 w-full rounded-full sm:w-32" />
                </section>

                <section>
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-9 w-36" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="mt-4 h-16 rounded-xl" />
                  <Skeleton className="mt-4 h-4 w-72 max-w-full" />
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Skeleton className="h-10 w-full rounded-xl" />
                    <Skeleton className="h-10 w-full rounded-xl sm:w-28" />
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-9 w-28" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                  <Skeleton className="mt-2 h-4 w-72 max-w-full" />
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Skeleton className="h-10 w-full rounded-xl" />
                    <Skeleton className="h-10 w-full rounded-xl sm:w-24" />
                  </div>
                  <Skeleton className="mt-3 h-10 w-24 rounded-full" />
                  <div className="mt-4 flex flex-wrap gap-2">
                    {Array.from({ length: 5 }, (_, index) => (
                      <Skeleton key={index} className="h-8 w-24 rounded-full" />
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <>
            <section>
              <h2 className="font-handwriting text-2xl text-card-foreground sm:text-3xl">Plan details</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {planConfig.name} · {planConfig.price}
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:max-w-xs">
                <div>
                  <p className="text-xs text-muted-foreground">Keywords</p>
                  <p className="mt-1 font-serif text-2xl text-foreground">{planConfig.maxKeywords}</p>
                </div>
              </div>

              <p className="mt-4 text-sm text-muted-foreground">
                Billing: <span className="font-medium text-foreground">{billing === "trial" ? "Free trial" : "Paid"}</span>
              </p>
              {billing === "trial" && trialEndsAt ? (
                <p className="text-sm text-muted-foreground">
                  Trial ends: <span className="font-medium text-foreground">{formatTime(trialEndsAt)}</span>
                </p>
              ) : null}

              <Link
                href="/pricing?manage=1"
                className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-full border border-border/40 px-5 text-sm font-medium text-foreground transition-opacity hover:opacity-80 sm:w-auto"
              >
                Manage plan
              </Link>
            </section>

            <section>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-handwriting text-2xl text-card-foreground sm:text-3xl">Telegram bot</h2>
                <span className="text-xs font-medium text-muted-foreground">
                  {telegramConfigured ? (telegramConnected ? "Connected" : "Not connected") : "Not configured"}
                </span>
              </div>

              {telegramConfigured ? (
                <>
                  {telegramConnected ? (
                    <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                      <p className="text-sm font-medium text-emerald-700">Telegram is connected</p>
                      <p className="mt-1 text-xs text-emerald-700/90">
                        Alerts are {telegramAlertsEnabled && !telegramPaused ? "active" : "paused"}.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-border/40 px-4 py-3">
                      <p className="text-sm text-muted-foreground">Telegram is not connected yet.</p>
                    </div>
                  )}

                  <p className="mt-1 text-sm text-muted-foreground">
                    Use Telegram for on-demand mentions and cooldown-based updates. Default replies show 20 mentions. You
                    can request more up to 100.
                  </p>

                  {telegramKeywordFilter || telegramPlatformFilter ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Saved bot filters: keyword{" "}
                      <span className="font-medium text-foreground">{telegramKeywordFilter ?? "all"}</span> · platform{" "}
                      <span className="font-medium text-foreground">{telegramPlatformFilter ?? "all"}</span>
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      onClick={() => void connectTelegram()}
                      disabled={isTelegramSaving}
                      className="h-10 w-full rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                    >
                      {isTelegramSaving
                        ? telegramConnected
                          ? "Refreshing token..."
                          : "Creating token..."
                        : telegramConnected
                          ? "Refresh connect code"
                          : "Connect Telegram"}
                    </button>
                    {telegramConnected ? (
                      <button
                        onClick={() => void disconnectTelegram()}
                        disabled={isTelegramSaving}
                        className="inline-flex h-10 w-full items-center justify-center rounded-full border border-border/40 px-5 text-sm font-medium text-foreground transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                      >
                        Disconnect
                      </button>
                    ) : null}
                  </div>

                  {telegramStartCode ? (
                    <div className="mt-4 rounded-xl border border-border/40 px-4 py-3">
                      <p className="text-sm font-medium text-foreground">Start code</p>
                      <p className="mt-2 break-all text-sm text-muted-foreground">/start {telegramStartCode}</p>
                      {telegramLinkExpiresAt ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Expires: <span className="font-medium text-foreground">{formatTime(telegramLinkExpiresAt)}</span>
                        </p>
                      ) : null}
                      {telegramBotUsername ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Bot: <span className="font-medium text-foreground">@{telegramBotUsername}</span>
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-xl border border-border/40 px-4 py-3 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Bot commands</p>
                    <p className="mt-2">/latest, /latest 50, /keyword chatgpt 20, /platform hackernews 20</p>
                    <p className="mt-1">/setkeyword all, /setplatform devto, /filters, /pause, /resume</p>
                  </div>
                </>
              ) : (
                <div className="mt-4 rounded-xl border border-border/40 px-4 py-3">
                  <p className="text-sm text-muted-foreground">Telegram bot is not configured on the server yet.</p>
                </div>
              )}

              {telegramFeedback ? (
                <p className="mt-4 rounded-xl border border-border/40 px-4 py-3 text-sm text-foreground">{telegramFeedback}</p>
              ) : null}
            </section>

            <section>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-handwriting text-2xl text-card-foreground sm:text-3xl">Slack alerts</h2>
                <span className="text-xs font-medium text-muted-foreground">
                  {canUseSlack ? (slackConnected ? "Connected" : "Not connected") : "Pro only"}
                </span>
              </div>

              {canUseSlack ? (
                <>
                  {slackConnected ? (
                    <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                      <p className="text-sm font-medium text-emerald-700">Slack is connected</p>
                      <p className="mt-1 text-xs text-emerald-700/90">
                        Mention alerts are active for your workspace.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-border/40 px-4 py-3">
                      <p className="text-sm text-muted-foreground">Slack is not connected yet.</p>
                    </div>
                  )}

                  <p className="mt-1 text-sm text-muted-foreground">
                    Connect your Slack incoming webhook to get mention updates faster.
                  </p>

                  {slackWebhookHint ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Current webhook: <span className="break-all font-medium text-foreground">{slackWebhookHint}</span>
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={slackWebhookInput}
                      onChange={(event) => setSlackWebhookInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          void connectSlack()
                        }
                      }}
                      placeholder="https://hooks.slack.com/services/..."
                      className="h-10 w-full rounded-xl border border-input bg-background px-4 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40 md:text-sm"
                    />
                    <button
                      onClick={() => void connectSlack()}
                      disabled={isSlackSaving || isSlackTesting}
                      className="h-10 w-full rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                    >
                      {isSlackSaving ? "Saving..." : slackConnected ? "Update" : "Connect"}
                    </button>
                  </div>

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      onClick={() => void sendSlackTest()}
                      disabled={!slackConnected || isSlackSaving || isSlackTesting}
                      className="inline-flex h-10 w-full items-center justify-center rounded-full border border-border/40 px-5 text-sm font-medium text-foreground transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                    >
                      {isSlackTesting ? "Sending..." : "Send test alert"}
                    </button>
                    {slackConnected ? (
                      <button
                        onClick={() => void disconnectSlack()}
                        disabled={isSlackSaving || isSlackTesting}
                        className="inline-flex h-10 w-full items-center justify-center rounded-full border border-border/40 px-5 text-sm font-medium text-foreground transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                      >
                        Disconnect
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="mt-4 rounded-xl border border-border/40 px-4 py-3">
                  <p className="text-sm text-muted-foreground">
                    Slack updates are available on Pro.
                  </p>
                  <Link
                    href="/pricing?manage=1"
                    className="mt-3 inline-flex h-9 items-center justify-center rounded-full border border-border/40 px-4 text-sm font-medium text-foreground transition-opacity hover:opacity-80"
                  >
                    Upgrade to Pro
                  </Link>
                </div>
              )}

              {slackFeedback ? (
                <p className="mt-3 rounded-xl border border-border/40 px-4 py-2.5 text-sm text-foreground">
                  {slackFeedback}
                </p>
              ) : null}
            </section>

            <section>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-handwriting text-2xl text-card-foreground sm:text-3xl">Keywords</h2>
                <span className="text-xs font-medium text-muted-foreground">{activeKeywords.length}/{planConfig.maxKeywords}</span>
              </div>
              <p className="mt-2 font-handwriting text-sm text-muted-foreground/90">
                type one keyword, click add, then type the next one, click add, and click done when finished
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  value={keywordInput}
                  onChange={(event) => setKeywordInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      void addKeyword()
                    }
                  }}
                  disabled={keywordLimitReached}
                  placeholder={keywordLimitReached ? "Keyword limit reached" : "e.g. social listening"}
                  className="h-10 w-full rounded-xl border border-input bg-background px-4 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50 md:text-sm"
                />
                <button
                  onClick={() => void addKeyword()}
                  disabled={isSaving || keywordLimitReached}
                  className="h-10 w-full rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                >
                  {keywordLimitReached ? "Limit reached" : "Add"}
                </button>
              </div>
              <div className="mt-3">
                <button
                  onClick={() => void finalizeKeywordChanges()}
                  disabled={!hasPendingKeywordBootstrap || isKeywordBootstrapping || isSaving}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-border/40 px-5 text-sm font-medium text-foreground transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isKeywordBootstrapping ? "Running..." : "Done"}
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {activeKeywords.map((keyword) => (
                  <button
                    key={keyword.id}
                    onClick={() => void removeKeyword(keyword)}
                    className="group max-w-full break-all rounded-full border border-border/40 px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:text-destructive"
                  >
                    {keyword.query} <span className="opacity-50 group-hover:opacity-100">×</span>
                  </button>
                ))}
                {!activeKeywords.length ? <p className="text-sm text-muted-foreground">No keywords added yet.</p> : null}
              </div>
            </section>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
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
