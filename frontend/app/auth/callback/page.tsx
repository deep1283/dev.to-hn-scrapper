"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { isPlanId } from "@/lib/plans"

type ExchangePayload = {
  nextRoute?: string
  profile?: {
    plan_selected_at: string | null
  }
  error?: string
}

type Tokens = {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

type TokenHashPayload = {
  tokenHash: string
  type: string
}

function extractPlanId(searchParams: { get(name: string): string | null }): string | null {
  const directPlan = searchParams.get("plan")
  if (directPlan && isPlanId(directPlan)) {
    return directPlan
  }

  const redirectTo = searchParams.get("redirect_to")
  if (!redirectTo) {
    return null
  }

  try {
    const parsed = new URL(redirectTo, window.location.origin)
    const nestedPlan = parsed.searchParams.get("plan")
    if (nestedPlan && isPlanId(nestedPlan)) {
      return nestedPlan
    }
  } catch {
    // ignore malformed redirect_to
  }

  return null
}

function parseTokens(searchParams: { get(name: string): string | null }): Tokens | null {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""))
  const accessToken = hashParams.get("access_token") ?? searchParams.get("access_token")
  const refreshToken = hashParams.get("refresh_token") ?? searchParams.get("refresh_token")
  const expiresRaw = hashParams.get("expires_in") ?? searchParams.get("expires_in")

  if (!accessToken || !refreshToken) {
    return null
  }

  const expiresIn = Number(expiresRaw ?? "3600")
  return {
    accessToken,
    refreshToken,
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? Math.floor(expiresIn) : 3600,
  }
}

async function exchangeSession(tokens: Tokens | TokenHashPayload): Promise<ExchangePayload> {
  const response = await fetch("/api/auth/session/exchange", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      "accessToken" in tokens
        ? tokens
        : {
            tokenHash: tokens.tokenHash,
            type: tokens.type,
          },
    ),
  })

  const payload = (await response.json().catch(() => null)) as ExchangePayload | null
  if (!response.ok) {
    throw new Error(payload?.error ?? "Unable to finish sign-in.")
  }
  return payload ?? {}
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
    throw new Error(payload?.error ?? "Unable to start trial.")
  }
}

export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const didRun = useRef(false)

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (didRun.current) {
      return
    }
    didRun.current = true

    async function finalizeSignIn() {
      try {
        const explicitError = searchParams.get("error_description") ?? searchParams.get("error")
        if (explicitError) {
          throw new Error(explicitError)
        }

        const tokens = parseTokens(searchParams)
        if (tokens && window.location.hash) {
          window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`)
        }

        const tokenHash = searchParams.get("token_hash")
        const callbackType = searchParams.get("type")

        let exchange: ExchangePayload
        if (tokens) {
          exchange = await exchangeSession(tokens)
        } else if (tokenHash && callbackType) {
          exchange = await exchangeSession({
            tokenHash,
            type: callbackType,
          })
        } else {
          throw new Error("This sign-in link is invalid or expired. Please request a new one.")
        }

        const planId = extractPlanId(searchParams)
        if (planId && !exchange.profile?.plan_selected_at) {
          await startTrial(planId)
          router.replace("/onboarding")
          return
        }

        router.replace(exchange.nextRoute ?? "/dashboard")
      } catch (callbackError) {
        setError(callbackError instanceof Error ? callbackError.message : "Unable to finish sign-in.")
      }
    }

    void finalizeSignIn()
  }, [router, searchParams])

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-6">
          <h1 className="font-serif text-2xl text-foreground">Sign-in failed</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Link
            href="/login"
            className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground"
          >
            Back to login
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
