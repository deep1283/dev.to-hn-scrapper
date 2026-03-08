"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { OnboardingSkeleton } from "@/components/onboarding/onboarding-skeleton"
import { PLAN_CONFIG, type PlanId } from "@/lib/plans"
import {
  getOnboardingBootstrap,
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

  const [termInput, setTermInput] = useState("")
  const [terms, setTerms] = useState<string[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const plan = PLAN_CONFIG[planId]

  useEffect(() => {
    async function bootstrap() {
      try {
        const payload = await getOnboardingBootstrap()
        const nextRoute = payload.nextRoute
        if (nextRoute !== "/onboarding") {
          router.replace(nextRoute)
          return
        }

        const validSession = { user: payload.user }
        const profile = payload.profile
        setSession(validSession)

        setPlanId(profile.plan_tier)
        setBilling(profile.billing_mode ?? "trial")
        setTerms(payload.keywords.map((item) => item.query))
      } catch (bootstrapError) {
        const message = bootstrapError instanceof Error ? bootstrapError.message : "Failed to load onboarding"
        if (message.toLowerCase().includes("please log in")) {
          router.replace("/login")
          return
        }
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

  const hasRequiredData = useMemo(() => terms.length > 0, [terms.length])
  const termLimitReached = terms.length >= plan.maxKeywords

  function addTerm() {
    setError(null)
    if (termLimitReached) {
      return
    }

    const normalized = cleanInput(termInput)
    if (!normalized) {
      return
    }

    if (terms.some((term) => term.toLowerCase() === normalized.toLowerCase())) {
      setTermInput("")
      return
    }

    setTerms((current) => [...current, normalized])
    setTermInput("")
  }

  function removeTerm(term: string) {
    setTerms((current) => current.filter((item) => item !== term))
  }

  async function continueToDashboard() {
    setError(null)

    if (!session) {
      router.replace("/login")
      return
    }

    if (!hasRequiredData) {
      setError("Please add at least one keyword to continue.")
      return
    }

    setIsSubmitting(true)

    try {
      const setup = await syncTrackingSetup(session, terms)
      router.push(setup.nextRoute || "/dashboard")
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save onboarding")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <OnboardingSkeleton />
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 md:py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
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
            Type the keywords you&apos;re looking to monitor. Then we&apos;ll redirect you to the dashboard.
          </p>
        </header>

        <section className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl text-foreground">Keywords to track</h2>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {terms.length}/{plan.maxKeywords}
            </span>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={termInput}
              onChange={(event) => setTermInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addTerm()
                }
              }}
              disabled={termLimitReached}
              placeholder={termLimitReached ? "Keyword limit reached" : "e.g. signalze, social listening, ai"}
              className="h-10 w-full rounded-xl border border-input bg-background px-4 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50 md:text-sm"
            />
            <button
              onClick={addTerm}
              disabled={termLimitReached}
              className="h-10 w-full shrink-0 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              {termLimitReached ? "Limit reached" : "Add"}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {terms.map((term) => (
              <button
                key={term}
                onClick={() => removeTerm(term)}
                className="group max-w-full break-all rounded-full bg-secondary px-3.5 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                {term} <span className="opacity-50 group-hover:opacity-100">×</span>
              </button>
            ))}
            {!terms.length ? <p className="text-sm text-muted-foreground">No keywords added yet.</p> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Plan</p>
              <p className="mt-1 font-serif text-xl text-foreground">{plan.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Billing</p>
              <p className="mt-1 text-sm font-medium text-foreground">{billing === "trial" ? "Free trial" : "Paid"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Keyword limit</p>
              <p className="mt-1 text-sm font-medium text-foreground">{plan.maxKeywords}</p>
            </div>
          </div>
        </section>

        {error ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{error}</p>
        ) : null}

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={continueToDashboard}
            disabled={isSubmitting || !hasRequiredData}
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Done"}
          </button>
        </div>
      </div>
    </main>
  )
}
