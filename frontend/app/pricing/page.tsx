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

  useEffect(() => {
    async function bootstrap() {
      try {
        const validSession = await getValidSession()
        if (!validSession) {
          if (manageMode) {
            router.replace(AUTH_ENTRY_PATH)
            return
          }
          setReady(true)
          return
        }

        setSession(validSession)
        const profile = await ensureProfile(validSession)
        setCurrentPlan(profile.plan_tier)

        if (!profile.plan_selected_at) {
          setReady(true)
          return
        }

        if (manageMode) {
          setReady(true)
          return
        }

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
          <p className="mt-6 font-handwriting text-lg text-primary">{manageMode ? "Manage plan" : "Pricing"}</p>
          <h1 className="mt-2 font-serif text-3xl text-foreground sm:text-5xl text-balance">
            {manageMode ? "Choose a different plan" : "Simple, honest pricing"}
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            {manageMode
              ? "Switch plans anytime. Your selection will be applied after checkout confirmation."
              : "Track mentions for your keywords across Hacker News, Dev.to, and GitHub Discussions. Start with a 2-day free trial."}
          </p>
        </div>

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
                      <PricingFeature>Faster refresh</PricingFeature>
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
                    <Link
                      href={session ? `/api/billing/change-plan?plan=${plan.id}` : AUTH_ENTRY_PATH}
                      className={`mt-auto inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-sm font-semibold transition-all active:scale-[0.98] ${
                        isPopular
                          ? "bg-accent text-accent-foreground hover:brightness-95"
                          : "border border-border text-foreground hover:bg-secondary"
                      }`}
                    >
                      Switch to {plan.name}
                    </Link>
                  )
                ) : (
                  <Link
                    href={`${AUTH_ENTRY_PATH}?plan=${plan.id}`}
                    className={`mt-auto inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-sm font-semibold transition-all active:scale-[0.98] ${
                      isPopular
                        ? "bg-accent text-accent-foreground hover:brightness-95"
                        : "border border-border text-foreground hover:bg-secondary"
                    }`}
                  >
                    Start 2-day free trial
                  </Link>
                )}
              </article>
            )
          })}
        </div>

        {/* Login link */}
        {manageMode ? (
          <p className="text-center text-sm text-muted-foreground">
            Done comparing plans?{" "}
            <Link href="/settings" className="font-medium text-foreground hover:underline">
              Back to settings
            </Link>
          </p>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href={AUTH_ENTRY_PATH} className="font-medium text-foreground hover:underline">
              Log in
            </Link>
          </p>
        )}
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
