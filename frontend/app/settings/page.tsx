"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { isTrialExpired } from "@/lib/client/billing"
import { PLAN_CONFIG, type PlanId } from "@/lib/plans"
import {
  ensureProfile,
  getValidSession,
  insertBrand,
  insertKeyword,
  listBrands,
  listKeywords,
  updateBrand,
  updateKeyword,
  type BillingMode,
  type BrandRow,
  type KeywordRow,
  type SessionData,
} from "@/lib/supabase-lite"

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

export default function SettingsPage() {
  const [session, setSession] = useState<SessionData | null>(null)
  const [plan, setPlan] = useState<PlanId>("starter_9")
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null)
  const [pendingPlanEffectiveAt, setPendingPlanEffectiveAt] = useState<string | null>(null)
  const [billing, setBilling] = useState<BillingMode>("trial")
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null)

  const [brandInput, setBrandInput] = useState("")
  const [keywordInput, setKeywordInput] = useState("")
  const [brandRows, setBrandRows] = useState<BrandRow[]>([])
  const [keywordRows, setKeywordRows] = useState<KeywordRow[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function bootstrap() {
      try {
        const validSession = await getValidSession()
        if (!validSession) {
          window.location.replace("/login")
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

        const [brands, keywords] = await Promise.all([listBrands(validSession), listKeywords(validSession)])
        setBrandRows(brands)
        setKeywordRows(keywords)
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
  const activeBrands = useMemo(() => brandRows.filter((item) => item.is_active), [brandRows])
  const activeKeywords = useMemo(() => keywordRows.filter((item) => item.is_active), [keywordRows])

  const overBrandCount =
    planConfig.maxBrands === null ? 0 : Math.max(0, activeBrands.length - planConfig.maxBrands)
  const overKeywordCount = Math.max(0, activeKeywords.length - planConfig.maxKeywords)
  const isOverPlanLimits = overBrandCount > 0 || overKeywordCount > 0

  const brandLimitReached = planConfig.maxBrands !== null && activeBrands.length >= planConfig.maxBrands
  const keywordLimitReached = activeKeywords.length >= planConfig.maxKeywords

  async function addBrand() {
    if (!session || brandLimitReached) {
      return
    }

    setError(null)
    const normalized = cleanInput(brandInput)
    if (!normalized) {
      return
    }

    const existing = brandRows.find((brand) => brand.name.toLowerCase() === normalized.toLowerCase())
    if (existing?.is_active) {
      setBrandInput("")
      return
    }

    setIsSaving(true)
    try {
      if (existing) {
        const updated = await updateBrand(session, existing.id, { is_active: true, name: normalized })
        if (updated) {
          setBrandRows((current) => current.map((row) => (row.id === updated.id ? updated : row)))
        }
      } else {
        const inserted = await insertBrand(session, normalized)
        setBrandRows((current) => [...current, inserted])
      }
      setBrandInput("")
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Failed to add brand")
    } finally {
      setIsSaving(false)
    }
  }

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
        const inserted = await insertKeyword(session, normalized)
        setKeywordRows((current) => [...current, inserted])
      }
      setKeywordInput("")
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Failed to add keyword")
    } finally {
      setIsSaving(false)
    }
  }

  async function removeBrand(brand: BrandRow) {
    if (!session) {
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const updated = await updateBrand(session, brand.id, { is_active: false })
      if (updated) {
        setBrandRows((current) => current.map((row) => (row.id === updated.id ? updated : row)))
      }
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Failed to remove brand")
    } finally {
      setIsSaving(false)
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
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined)
    window.location.replace("/login")
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
              <span className="font-serif text-2xl font-bold text-foreground">signalze</span>
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
        </header>

        <section className="p-2 sm:p-3">
          <h1 className="font-handwriting text-4xl text-card-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your plan, brands, and keywords.</p>

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
                {overBrandCount > 0 ? `${overBrandCount} brand${overBrandCount > 1 ? "s" : ""} over limit` : "Brand limit OK"}
                {" · "}
                {overKeywordCount > 0
                  ? `${overKeywordCount} keyword${overKeywordCount > 1 ? "s" : ""} over limit`
                  : "Keyword limit OK"}
              </p>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-foreground">Brands to adjust</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {activeBrands.map((brand) => (
                      <button
                        key={brand.id}
                        onClick={() => void removeBrand(brand)}
                        className="group rounded-full border border-border/40 bg-background px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:text-destructive"
                      >
                        {brand.name} <span className="opacity-50 group-hover:opacity-100">×</span>
                      </button>
                    ))}
                    {!activeBrands.length ? <span className="text-xs text-muted-foreground">No active brands.</span> : null}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-foreground">Keywords to adjust</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {activeKeywords.map((keyword) => (
                      <button
                        key={keyword.id}
                        onClick={() => void removeKeyword(keyword)}
                        className="group rounded-full border border-border/40 bg-background px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:text-destructive"
                      >
                        {keyword.query} <span className="opacity-50 group-hover:opacity-100">×</span>
                      </button>
                    ))}
                    {!activeKeywords.length ? <span className="text-xs text-muted-foreground">No active keywords.</span> : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex max-w-4xl flex-col gap-10">
            <section>
              <h2 className="font-handwriting text-3xl text-card-foreground">Plan details</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {planConfig.name} · {planConfig.price}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Brands</p>
                  <p className="mt-1 font-serif text-2xl text-foreground">{planConfig.maxBrands === null ? "∞" : planConfig.maxBrands}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Keywords</p>
                  <p className="mt-1 font-serif text-2xl text-foreground">{planConfig.maxKeywords}</p>
                </div>
              </div>

              <p className="mt-4 text-sm text-muted-foreground">
                Billing: <span className="font-medium text-foreground">{billing === "trial" ? "2-day free trial" : "Paid"}</span>
              </p>
              {billing === "trial" && trialEndsAt ? (
                <p className="text-sm text-muted-foreground">
                  Trial ends: <span className="font-medium text-foreground">{formatTime(trialEndsAt)}</span>
                </p>
              ) : null}

              <Link
                href="/pricing?manage=1"
                className="mt-5 inline-flex h-10 items-center justify-center rounded-full border border-border/40 px-5 text-sm font-medium text-foreground transition-opacity hover:opacity-80"
              >
                Manage plan
              </Link>
            </section>

            <section>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-handwriting text-3xl text-card-foreground">Brands</h2>
                <span className="text-xs font-medium text-muted-foreground">{activeBrands.length}/{planConfig.maxBrands ?? "∞"}</span>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  value={brandInput}
                  onChange={(event) => setBrandInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      void addBrand()
                    }
                  }}
                  disabled={brandLimitReached}
                  placeholder={brandLimitReached ? "Remove existing brand first" : "e.g. Signalze"}
                  className="h-10 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
                />
                <button
                  onClick={() => void addBrand()}
                  disabled={isSaving || brandLimitReached}
                  className="h-10 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {brandLimitReached ? "Limit reached" : "Add"}
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {activeBrands.map((brand) => (
                  <button
                    key={brand.id}
                    onClick={() => void removeBrand(brand)}
                    className="group rounded-full border border-border/40 px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:text-destructive"
                  >
                    {brand.name} <span className="opacity-50 group-hover:opacity-100">×</span>
                  </button>
                ))}
                {!activeBrands.length ? <p className="text-sm text-muted-foreground">No brands added yet.</p> : null}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-handwriting text-3xl text-card-foreground">Niche keywords</h2>
                <span className="text-xs font-medium text-muted-foreground">{activeKeywords.length}/{planConfig.maxKeywords}</span>
              </div>
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
                  className="h-10 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
                />
                <button
                  onClick={() => void addKeyword()}
                  disabled={isSaving || keywordLimitReached}
                  className="h-10 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {keywordLimitReached ? "Limit reached" : "Add"}
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {activeKeywords.map((keyword) => (
                  <button
                    key={keyword.id}
                    onClick={() => void removeKeyword(keyword)}
                    className="group rounded-full border border-border/40 px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:text-destructive"
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
