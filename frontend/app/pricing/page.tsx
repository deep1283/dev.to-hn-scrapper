"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"

import { isTrialExpired } from "@/lib/client/billing"
import { PLAN_CONFIG, type PlanId } from "@/lib/plans"
import { ensureProfile, getValidSession, type SessionData } from "@/lib/supabase-lite"

const PLAN_ORDER: PlanId[] = ["starter_9", "growth_15"]
const SOURCES = ["Hacker News", "Dev.to", "GitHub Discussions"]
const AUTH_ENTRY_PATH = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? "/sign-in" : "/login"

function PricingLoading() {
  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
        Loading...
      </div>
    </main>
  )
}

async function startTrial(planId: string): Promise<{ nextRoute?: string }> {
  const response = await fetch("/api/billing/start-trial", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ plan: planId }),
  })

  const payload = (await response.json().catch(() => null)) as { error?: string; nextRoute?: string } | null
  if (!response.ok) {
    throw new Error(payload?.error ?? "Unable to start free trial.")
  }

  return { nextRoute: payload?.nextRoute }
}

function PricingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const manageMode = searchParams.get("manage") === "1"
  const planChange = searchParams.get("plan_change")
  const planChangeMode = searchParams.get("mode")
  const planChangeReason = searchParams.get("reason")
  const planChangeEffective = searchParams.get("effective")
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<SessionData | null>(null)
  const [currentPlan, setCurrentPlan] = useState<PlanId | null>(null)
  const [isStartingTrial, setIsStartingTrial] = useState<PlanId | null>(null)
  const [isChangingPlan, setIsChangingPlan] = useState<PlanId | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function bootstrap() {
      try {
        const validSession = await getValidSession()
        if (!validSession) {
          // Not authenticated — redirect to login
          router.replace(AUTH_ENTRY_PATH)
          return
        }

        setSession(validSession)
        const profile = await ensureProfile(validSession)
        setCurrentPlan(profile.plan_tier)

        // New user: no plan selected yet — show plan selection
        if (!profile.plan_selected_at) {
          setReady(true)
          return
        }

        // Manage mode: let them switch plans
        if (manageMode) {
          setReady(true)
          return
        }

        // Has a plan and not in manage mode — redirect away
        if (isTrialExpired(profile.billing_mode, profile.trial_ends_at)) {
          router.replace("/upgrade")
          return
        }

        router.replace(profile.onboarding_completed ? "/dashboard" : "/onboarding")
      } catch {
        setReady(true)
      }
    }
    void bootstrap()
  }, [manageMode, router])

  async function handleStartTrial(planId: PlanId) {
    setError(null)
    setIsStartingTrial(planId)
    try {
      const result = await startTrial(planId)
      router.replace(result.nextRoute ?? "/onboarding")
    } catch (trialError) {
      setError(trialError instanceof Error ? trialError.message : "Unable to start trial.")
      setIsStartingTrial(null)
    }
  }

  function handleChangePlan(planId: PlanId) {
    if (!session) {
      router.replace(AUTH_ENTRY_PATH)
      return
    }
    setIsChangingPlan(planId)
    // Direct browser navigation to the API route which redirects to checkout or billing portal
    window.location.assign(`/api/billing/change-plan?plan=${planId}`)
  }

  if (!ready) {
    return <PricingLoading />
  }

  return (
    <main className="min-h-screen bg-background px-4 py-16 sm:px-6 md:py-24">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-12">
        {/* Header */}
        <div className="text-center">
          <Link href="/" className="font-serif text-xl font-bold text-foreground">
            signalze
          </Link>
          <p className="mt-6 font-handwriting text-lg text-primary">{manageMode ? "Manage plan" : "Choose your plan"}</p>
          <h1 className="mt-2 font-serif text-3xl text-foreground sm:text-5xl text-balance">
            {manageMode ? "Choose a different plan" : "Start your 2-day free trial"}
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground text-balance mx-auto">
            {manageMode
              ? "Switch plans anytime. Your selection will be applied after checkout confirmation."
              : "Pick a plan and start tracking mentions across Hacker News, Dev.to, and GitHub Discussions. No credit card required—you won't be charged for the 2-day trial."}
          </p>
        </div>

        {error ? (
          <p className="max-w-2xl rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {manageMode && planChange ? (
          <p
            className={`max-w-2xl rounded-xl px-4 py-3 text-sm ${
              planChange === "success"
                ? "bg-primary/10 text-foreground"
                : planChange === "noop"
                  ? "bg-secondary text-muted-foreground"
                  : "bg-destructive/10 text-destructive"
            }`}
          >
            {planChange === "success" && planChangeMode === "upgrade"
              ? "Upgrade submitted. The new plan is applied now and only the prorated difference is charged."
              : planChange === "success" && planChangeMode === "downgrade"
                ? `Downgrade scheduled. Your current access stays active until this billing cycle ends${
                    planChangeEffective ? ` (${new Date(planChangeEffective).toLocaleString()})` : ""
                  }. The lower plan applies from the next cycle.`
                : planChange === "noop"
                  ? "You are already on this plan."
                  : `Plan change failed${planChangeReason ? `: ${planChangeReason}` : "."}`}
          </p>
        ) : null}

        {/* Plan cards */}
        <div className="grid w-full max-w-3xl gap-6 sm:grid-cols-2">
          {PLAN_ORDER.map((planId) => {
            const plan = PLAN_CONFIG[planId]
            const isPopular = planId === "growth_15"
            return (
              <article
                key={plan.id}
                className={`relative flex flex-col gap-6 rounded-2xl border bg-card p-6 transition-all duration-200 hover:shadow-lg sm:p-8 ${
                  isPopular
                    ? "border-accent shadow-md"
                    : "border-border/60"
                }`}
              >
                {isPopular ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-1 text-xs font-semibold text-accent-foreground">
                    Most popular
                  </span>
                ) : null}

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {plan.name}
                  </p>
                  <p className="mt-3 font-serif text-4xl text-foreground sm:text-5xl">
                    {plan.price}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {plan.description}
                  </p>
                </div>

                <ul className="flex flex-col gap-2.5 text-sm text-foreground">
                  <PricingFeature>Up to {plan.maxKeywords} keywords</PricingFeature>
                  <PricingFeature>2-day free trial</PricingFeature>
                  {SOURCES.map((s) => (
                    <PricingFeature key={s}>{s}</PricingFeature>
                  ))}
                  {plan.id === "starter_9" ? (
                    <>
                      <PricingFeature>Dashboard updates</PricingFeature>
                      <PricingFeature>Standard refresh</PricingFeature>
                    </>
                  ) : (
                    <>
                      <PricingFeature>Slack updates</PricingFeature>
                      <PricingFeature>Faster fetching</PricingFeature>
                      <PricingFeature>X monitoring (coming soon)</PricingFeature>
                    </>
                  )}
                </ul>

                {manageMode ? (
                  currentPlan === plan.id ? (
                    <span className="mt-auto inline-flex h-12 w-full items-center justify-center rounded-full border border-border bg-secondary px-6 text-sm font-semibold text-muted-foreground">
                      Current plan
                    </span>
                  ) : (
                    <button
                      onClick={() => handleChangePlan(planId)}
                      disabled={isChangingPlan !== null}
                      className={`mt-auto inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-sm font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 ${
                        isPopular
                          ? "bg-accent text-accent-foreground hover:brightness-95"
                          : "border border-border text-foreground hover:bg-secondary"
                      }`}
                    >
                      {isChangingPlan === planId ? "Redirecting..." : `Switch to ${plan.name}`}
                    </button>
                  )
                ) : (
                  <button
                    onClick={() => void handleStartTrial(planId)}
                    disabled={isStartingTrial !== null}
                    className={`mt-auto inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-sm font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 ${
                      isPopular
                        ? "bg-accent text-accent-foreground hover:brightness-95"
                        : "border border-border text-foreground hover:bg-secondary"
                    }`}
                  >
                    {isStartingTrial === planId ? "Starting trial..." : "Start 2-day free trial"}
                  </button>
                )}
              </article>
            )
          })}
        </div>

        {/* Bottom link */}
        {manageMode ? (
          <p className="text-center text-sm text-muted-foreground">
            Done comparing plans?{" "}
            <Link href="/settings" className="font-medium text-foreground hover:underline">
              Back to settings
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  )
}

export default function PricingPage() {
  return (
    <Suspense fallback={<PricingLoading />}>
      <PricingContent />
    </Suspense>
  )
}

function PricingFeature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-primary"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
      <span>{children}</span>
    </li>
  )
}
