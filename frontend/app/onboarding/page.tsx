"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { isTrialExpired } from "@/lib/client/billing"
import { PLAN_CONFIG, type PlanId } from "@/lib/plans"
import {
  ensureProfile,
  getValidSession,
  listBrands,
  listKeywords,
  syncTrackingSetup,
  type BillingMode,
  type SessionData,
} from "@/lib/supabase-lite"

function cleanInput(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

export default function OnboardingPage() {
  const router = useRouter()

  const [session, setSession] = useState<SessionData | null>(null)
  const [planId, setPlanId] = useState<PlanId>("starter_9")
  const [billing, setBilling] = useState<BillingMode>("trial")

  const [brandInput, setBrandInput] = useState("")
  const [keywordInput, setKeywordInput] = useState("")
  const [brands, setBrands] = useState<string[]>([])
  const [keywords, setKeywords] = useState<string[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const plan = PLAN_CONFIG[planId]

  useEffect(() => {
    async function bootstrap() {
      try {
        const validSession = await getValidSession()
        if (!validSession) {
          router.replace("/login")
          return
        }
        setSession(validSession)

        const profile = await ensureProfile(validSession)
        if (!profile?.plan_selected_at) {
          router.replace("/pricing")
          return
        }

        if (isTrialExpired(profile.billing_mode, profile.trial_ends_at)) {
          router.replace("/upgrade")
          return
        }

        setPlanId(profile.plan_tier)
        setBilling(profile.billing_mode ?? "trial")

        const [existingBrands, existingKeywords] = await Promise.all([listBrands(validSession), listKeywords(validSession)])
        setBrands(existingBrands.map((item) => item.name))
        setKeywords(existingKeywords.map((item) => item.query))

        if (profile.onboarding_completed) {
          router.replace("/dashboard")
          return
        }
      } catch (bootstrapError) {
        const message = bootstrapError instanceof Error ? bootstrapError.message : "Failed to load onboarding"
        if (message.toLowerCase().includes("trial has ended")) {
          router.replace("/upgrade")
          return
        }
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }

    void bootstrap()
  }, [router])

  const hasRequiredData = useMemo(() => brands.length > 0 && keywords.length > 0, [brands.length, keywords.length])

  const brandLimitReached = plan.maxBrands !== null && brands.length >= plan.maxBrands
  const keywordLimitReached = keywords.length >= plan.maxKeywords

  function addBrand() {
    setError(null)
    if (brandLimitReached) {
      return
    }
    const normalized = cleanInput(brandInput)
    if (!normalized) {
      return
    }

    if (brands.some((brand) => brand.toLowerCase() === normalized.toLowerCase())) {
      setBrandInput("")
      return
    }

    setBrands((current) => [...current, normalized])
    setBrandInput("")
  }

  function addKeyword() {
    setError(null)
    if (keywordLimitReached) {
      return
    }
    const normalized = cleanInput(keywordInput)
    if (!normalized) {
      return
    }

    if (keywords.some((keyword) => keyword.toLowerCase() === normalized.toLowerCase())) {
      setKeywordInput("")
      return
    }

    setKeywords((current) => [...current, normalized])
    setKeywordInput("")
  }

  function removeBrand(brand: string) {
    setBrands((current) => current.filter((item) => item !== brand))
  }

  function removeKeyword(keyword: string) {
    setKeywords((current) => current.filter((item) => item !== keyword))
  }

  async function continueToDashboard() {
    setError(null)

    if (!session) {
      router.replace("/login")
      return
    }

    if (!hasRequiredData) {
      setError("Please add at least one brand and one keyword to continue.")
      return
    }

    setIsSubmitting(true)

    try {
      await syncTrackingSetup(session, brands, keywords)
      router.push("/dashboard")
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save onboarding")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6 md:py-12">
        <div className="mx-auto w-full max-w-3xl rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
          Loading onboarding...
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 md:py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        {/* Header */}
        <header className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href="/" className="font-serif text-lg font-bold text-foreground">
              signalze
            </Link>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">Step 3 of 4</span>
          </div>
          <p className="mt-4 font-handwriting text-lg text-primary">Almost there!</p>
          <h1 className="mt-1 font-serif text-2xl text-foreground sm:text-3xl">Set up your tracking</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Add your brand and niche keywords. Then we&apos;ll redirect you to the dashboard.
          </p>
        </header>

        {/* Brands + Keywords */}
        <section className="grid gap-5 md:grid-cols-2">
          {/* Brands */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl text-foreground">Brands to track</h2>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {brands.length}/{plan.maxBrands ?? "∞"}
              </span>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                value={brandInput}
                onChange={(event) => setBrandInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    addBrand()
                  }
                }}
                disabled={brandLimitReached}
                placeholder={brandLimitReached ? "Remove existing brand first" : "e.g. Signalze"}
                className="h-10 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
              />
              <button
                onClick={addBrand}
                disabled={brandLimitReached}
                className="h-10 w-full shrink-0 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              >
                {brandLimitReached ? "Limit reached" : "Add"}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {brands.map((brand) => (
                <button
                  key={brand}
                  onClick={() => removeBrand(brand)}
                  className="group max-w-full break-all rounded-full bg-secondary px-3.5 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  {brand}{" "}
                  <span className="opacity-50 group-hover:opacity-100">×</span>
                </button>
              ))}
            </div>
          </div>

          {/* Keywords */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl text-foreground">Keywords to track</h2>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {keywords.length}/{plan.maxKeywords}
              </span>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    addKeyword()
                  }
                }}
                disabled={keywordLimitReached}
                placeholder={keywordLimitReached ? "Keyword limit reached" : "e.g. social listening"}
                className="h-10 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
              />
              <button
                onClick={addKeyword}
                disabled={keywordLimitReached}
                className="h-10 w-full shrink-0 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              >
                {keywordLimitReached ? "Limit reached" : "Add"}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {keywords.map((keyword) => (
                <button
                  key={keyword}
                  onClick={() => removeKeyword(keyword)}
                  className="group max-w-full break-all rounded-full bg-muted px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  {keyword}{" "}
                  <span className="opacity-50 group-hover:opacity-100">×</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Continue section */}
        <section className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Plan: <span className="font-medium text-foreground">{plan.name}</span> ({plan.price})
              </p>
              <p className="text-sm text-muted-foreground">
                Billing: <span className="font-medium text-foreground">{billing === "trial" ? `${plan.trialDays}-day free trial` : "Paid from day 1"}</span>
              </p>
            </div>

            <button
              onClick={() => void continueToDashboard()}
              disabled={isSubmitting}
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-accent px-8 text-sm font-semibold text-accent-foreground transition-all hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            >
              {isSubmitting ? "Saving..." : "Continue to dashboard →"}
            </button>
          </div>

          {error ? (
            <p className="mt-3 rounded-xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  )
}
