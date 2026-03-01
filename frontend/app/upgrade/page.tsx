"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { isTrialExpired } from "@/lib/client/billing"
import { PLAN_CONFIG, type PlanId } from "@/lib/plans"
import { ensureProfile, getValidSession, type SessionData } from "@/lib/supabase-lite"

const PLAN_ORDER: PlanId[] = ["starter_9", "growth_15"]
const SOURCES = ["Hacker News", "Dev.to", "GitHub Discussions"]

export default function UpgradePage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<SessionData | null>(null)

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

        if (!profile.plan_selected_at) {
          router.replace("/pricing")
          return
        }

        if (!isTrialExpired(profile.billing_mode, profile.trial_ends_at)) {
          router.replace(profile.onboarding_completed ? "/dashboard" : "/onboarding")
          return
        }

        setReady(true)
      } catch {
        router.replace("/login")
      }
    }
    void bootstrap()
  }, [router])

  if (!ready) {
    return (
      <main className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto w-full max-w-3xl rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
          Loading...
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background px-4 py-16 sm:px-6 md:py-24">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-12">
        <div className="text-center">
          <Link href="/" className="font-serif text-xl font-bold text-foreground">
            signalze
          </Link>
          <p className="mt-6 font-handwriting text-lg text-primary">
            Trial ended
          </p>
          <h1 className="mt-2 font-serif text-3xl text-foreground sm:text-5xl">
            Your trial has ended
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            Upgrade now to continue tracking mentions and receiving Slack alerts.
          </p>
        </div>

        <div className="grid w-full max-w-3xl gap-6 sm:grid-cols-2">
          {PLAN_ORDER.map((planId) => {
            const plan = PLAN_CONFIG[planId]
            const isPopular = planId === "growth_15"
            const ctaHref = session ? `/api/dodo/checkout?plan=${plan.id}&billing=paid` : "/login"

            return (
              <article
                key={plan.id}
                className={`relative flex flex-col gap-6 rounded-2xl border bg-card p-6 transition-all duration-200 hover:shadow-lg sm:p-8 ${
                  isPopular ? "border-accent shadow-md" : "border-border/60"
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
                  <UpgradeFeature>
                    {plan.maxBrands === null ? "Multiple brands" : `${plan.maxBrands} brand`}
                  </UpgradeFeature>
                  <UpgradeFeature>{plan.maxKeywords} keywords</UpgradeFeature>
                  {SOURCES.map((s) => (
                    <UpgradeFeature key={s}>{s}</UpgradeFeature>
                  ))}
                  <UpgradeFeature>Slack notifications</UpgradeFeature>
                </ul>

                <Link
                  href={ctaHref}
                  className={`mt-auto inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-sm font-semibold transition-all active:scale-[0.98] ${
                    isPopular
                      ? "bg-accent text-accent-foreground hover:brightness-95"
                      : "border border-border text-foreground hover:bg-secondary"
                  }`}
                >
                  Upgrade now
                </Link>
              </article>
            )
          })}
        </div>
      </div>
    </main>
  )
}

function UpgradeFeature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <svg className="mt-0.5 h-4 w-4 shrink-0 text-primary" viewBox="0 0 20 20" fill="currentColor">
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
