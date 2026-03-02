"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"

import { isPlanId } from "@/lib/plans"

type SessionPayload = {
  nextRoute?: string
  profile?: {
    plan_selected_at: string | null
  }
  error?: string
}

const SESSION_RETRY_ATTEMPTS = 8
const SESSION_RETRY_DELAY_MS = 350

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function getSafeNext(next: string | null): string | null {
  if (!next || !next.startsWith("/")) {
    return null
  }

  if (next === "/login" || next === "/sign-in") {
    return null
  }

  return next
}

async function startTrial(planId: string) {
  const response = await fetch("/api/billing/start-trial", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ plan: planId }),
  })

  const payload = (await response.json().catch(() => null)) as { error?: string } | null
  if (!response.ok) {
    throw new Error(payload?.error ?? "Unable to start free trial.")
  }
}

async function loadSessionWithRetry(): Promise<SessionPayload> {
  for (let attempt = 0; attempt < SESSION_RETRY_ATTEMPTS; attempt += 1) {
    const response = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (response.status === 401) {
      if (attempt < SESSION_RETRY_ATTEMPTS - 1) {
        await sleep(SESSION_RETRY_DELAY_MS)
        continue
      }
      throw new Error("Your sign-in session expired. Please sign in again.")
    }

    const payload = (await response.json().catch(() => null)) as SessionPayload | null
    if (!response.ok) {
      throw new Error(payload?.error ?? "Unable to finish sign-in.")
    }

    return payload ?? {}
  }

  throw new Error("Unable to finish sign-in.")
}

function AuthCompleteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const didRun = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const safeNext = useMemo(() => getSafeNext(searchParams.get("next")), [searchParams])
  const selectedPlan = useMemo(() => {
    const plan = searchParams.get("plan")
    return plan && isPlanId(plan) ? plan : null
  }, [searchParams])

  useEffect(() => {
    if (didRun.current) {
      return
    }
    didRun.current = true

    async function finalize() {
      try {
        const payload = await loadSessionWithRetry()

        if (selectedPlan && !payload.profile?.plan_selected_at) {
          await startTrial(selectedPlan)
          router.replace("/onboarding")
          return
        }

        const destination = payload.nextRoute === "/dashboard" && safeNext ? safeNext : payload.nextRoute ?? "/dashboard"
        router.replace(destination)
      } catch (finalizeError) {
        setError(finalizeError instanceof Error ? finalizeError.message : "Unable to finish sign-in.")
      }
    }

    void finalize()
  }, [router, safeNext, selectedPlan])

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-6">
          <h1 className="font-serif text-2xl text-foreground">Sign-in failed</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Link
            href="/sign-in"
            className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground"
          >
            Back to sign in
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="rounded-2xl border border-border/60 bg-card px-6 py-4 text-sm text-muted-foreground">
        Finishing sign-in...
      </div>
    </main>
  )
}

export default function AuthCompletePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="rounded-2xl border border-border/60 bg-card px-6 py-4 text-sm text-muted-foreground">
            Finishing sign-in...
          </div>
        </main>
      }
    >
      <AuthCompleteContent />
    </Suspense>
  )
}
