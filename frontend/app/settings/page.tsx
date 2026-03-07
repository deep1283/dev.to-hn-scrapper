"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { isTrialExpired } from "@/lib/client/billing"
import { PLAN_CONFIG, type PlanId } from "@/lib/plans"
import {
  bootstrapKeywordMentions,
  ensureProfile,
  getValidSession,
  insertKeyword,
  listKeywords,
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

  useEffect(() => {
    async function bootstrap() {
      try {
        const validSession = await getValidSession()
        if (!validSession) {
          window.location.replace(AUTH_ENTRY_PATH)
          return
        }

        setSession(validSession)

        const profile = await ensureProfile(validSession)
        if (!profile?.plan_selected_at) {
          window.location.replace("/pricing")
          return
        }

        if (isTrialExpired(profile.billing_mode, profile.trial_ends_at)) {
          window.location.replace("/upgrade")
          return
        }

        if (!profile.onboarding_completed) {
          window.location.replace("/onboarding")
          return
        }

        setPlan(profile.plan_tier)
        setPendingPlan(profile.pending_plan_tier)
        setPendingPlanEffectiveAt(profile.pending_plan_effective_at)
        setBilling(profile.billing_mode ?? "trial")
        setTrialEndsAt(profile.trial_ends_at ?? null)

        const [keywords, slackStatusResponse] = await Promise.all([
          listKeywords(validSession),
          fetch("/api/integrations/slack", {
            method: "GET",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
          }),
        ])
        setKeywordRows(keywords)
        if (slackStatusResponse.ok) {
          const slackStatus = (await slackStatusResponse.json()) as SlackStatusResponse
          setSlackConnected(Boolean(slackStatus.connected))
          setSlackWebhookHint(slackStatus.webhookHint ?? null)
        }
      } catch (bootstrapError) {
        const message = bootstrapError instanceof Error ? bootstrapError.message : "Failed to load settings"
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

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6 md:py-12">
        <div className="mx-auto w-full max-w-3xl p-6 text-sm text-muted-foreground">Loading settings...</div>
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
