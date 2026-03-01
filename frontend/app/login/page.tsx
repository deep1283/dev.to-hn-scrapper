"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { FormEvent, Suspense, useEffect, useState } from "react"

import { isTrialExpired } from "@/lib/client/billing"
import { isPlanId } from "@/lib/plans"
import { ensureProfile, getValidSession } from "@/lib/supabase-lite"

type StartTrialResponse = {
  nextRoute?: string
}

type MagicLinkResponse = {
  ok?: boolean
  message?: string
}

async function startTrial(planId: string): Promise<StartTrialResponse> {
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

async function sendMagicLink(email: string, plan: string | null): Promise<MagicLinkResponse> {
  const response = await fetch("/api/auth/magic-link", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      plan: plan ?? undefined,
    }),
  })

  const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null
  if (!response.ok) {
    throw new Error(payload?.error ?? "Unable to send magic link.")
  }

  return {
    ok: true,
    message: payload?.message,
  }
}

/* ------------------------------------------------------------------ */
/*  Brand illustration SVG — hand-drawn style,                        */
/*  shows a monitoring feed with floating notification badges          */
/* ------------------------------------------------------------------ */
function BrandIllustration() {
  return (
    <svg
      viewBox="0 0 480 480"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-full w-full max-w-[400px]"
      aria-hidden="true"
    >
      {/* Background circle */}
      <circle cx="240" cy="240" r="200" fill="#eeeadf" opacity="0.6" />
      <circle cx="240" cy="240" r="160" fill="#e8e5d8" opacity="0.4" />

      {/* Phone body */}
      <rect x="160" y="80" width="160" height="300" rx="20" fill="#ffffff" stroke="#e2dfd2" strokeWidth="2" />
      <rect x="170" y="100" width="140" height="260" rx="12" fill="#f7f5ef" />

      {/* Status bar */}
      <rect x="185" y="108" width="30" height="4" rx="2" fill="#c5e04a" />
      <circle cx="290" cy="110" r="3" fill="#3d4f1e" opacity="0.3" />

      {/* App header */}
      <text x="185" y="136" fontFamily="serif" fontSize="14" fontWeight="bold" fill="#1a1a1a">signalze</text>

      {/* Mention card 1 - HN */}
      <rect x="178" y="152" width="124" height="48" rx="8" fill="#ffffff" stroke="#e2dfd2" strokeWidth="1" />
      <circle cx="194" cy="168" r="8" fill="#ff6600" opacity="0.15" />
      <text x="194" y="172" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#ff6600">Y</text>
      <rect x="208" y="162" width="60" height="4" rx="2" fill="#1a1a1a" opacity="0.6" />
      <rect x="208" y="172" width="80" height="3" rx="1.5" fill="#7a7a7a" opacity="0.4" />
      <rect x="208" y="180" width="40" height="3" rx="1.5" fill="#7a7a7a" opacity="0.3" />
      {/* Status dot */}
      <circle cx="290" cy="168" r="4" fill="#c5e04a" />

      {/* Mention card 2 - Dev.to */}
      <rect x="178" y="208" width="124" height="48" rx="8" fill="#ffffff" stroke="#e2dfd2" strokeWidth="1" />
      <rect x="186" y="220" width="16" height="16" rx="4" fill="#0A0A0A" />
      <text x="194" y="232" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#ffffff">D</text>
      <rect x="208" y="220" width="50" height="4" rx="2" fill="#1a1a1a" opacity="0.6" />
      <rect x="208" y="230" width="70" height="3" rx="1.5" fill="#7a7a7a" opacity="0.4" />
      <rect x="208" y="238" width="45" height="3" rx="1.5" fill="#7a7a7a" opacity="0.3" />
      <circle cx="290" cy="228" r="4" fill="#c5e04a" />

      {/* Mention card 3 - GitHub */}
      <rect x="178" y="264" width="124" height="48" rx="8" fill="#ffffff" stroke="#e2dfd2" strokeWidth="1" />
      <circle cx="194" cy="280" r="8" fill="#111827" opacity="0.1" />
      <circle cx="194" cy="280" r="5" fill="#111827" opacity="0.6" />
      <rect x="208" y="276" width="55" height="4" rx="2" fill="#1a1a1a" opacity="0.6" />
      <rect x="208" y="286" width="75" height="3" rx="1.5" fill="#7a7a7a" opacity="0.4" />
      <rect x="208" y="294" width="35" height="3" rx="1.5" fill="#7a7a7a" opacity="0.3" />
      <circle cx="290" cy="280" r="4" fill="#f59e0b" />

      {/* Home indicator */}
      <rect x="218" y="364" width="44" height="4" rx="2" fill="#1a1a1a" opacity="0.15" />

      {/* Floating notification badge - top right */}
      <g transform="translate(330, 100)">
        <rect width="90" height="32" rx="16" fill="#ffffff" stroke="#e2dfd2" strokeWidth="1" />
        <circle cx="18" cy="16" r="6" fill="#c5e04a" />
        <rect x="30" y="12" width="48" height="4" rx="2" fill="#1a1a1a" opacity="0.5" />
        <rect x="30" y="20" width="32" height="3" rx="1.5" fill="#7a7a7a" opacity="0.3" />
      </g>

      {/* Floating badge - top left */}
      <g transform="translate(60, 140)">
        <rect width="80" height="28" rx="14" fill="#ffffff" stroke="#e2dfd2" strokeWidth="1" />
        <text x="40" y="18" textAnchor="middle" fontSize="9" fontWeight="600" fill="#3d4f1e">Real-time</text>
      </g>

      {/* Floating badge - bottom right */}
      <g transform="translate(340, 280)">
        <rect width="85" height="28" rx="14" fill="#c5e04a" opacity="0.3" />
        <text x="42" y="18" textAnchor="middle" fontSize="9" fontWeight="600" fill="#3d4f1e">+3 new</text>
      </g>

      {/* Floating badge - bottom left */}
      <g transform="translate(70, 300)">
        <rect width="72" height="28" rx="14" fill="#ffffff" stroke="#e2dfd2" strokeWidth="1" />
        <circle cx="18" cy="14" r="5" fill="#3d4f1e" opacity="0.15" />
        <rect x="28" y="10" width="32" height="4" rx="2" fill="#1a1a1a" opacity="0.4" />
        <rect x="28" y="18" width="24" height="3" rx="1.5" fill="#7a7a7a" opacity="0.3" />
      </g>

      {/* Decorative dots */}
      <circle cx="80" cy="100" r="3" fill="#c5e04a" opacity="0.4" />
      <circle cx="400" cy="200" r="4" fill="#c5e04a" opacity="0.3" />
      <circle cx="120" cy="380" r="3" fill="#3d4f1e" opacity="0.15" />
      <circle cx="380" cy="360" r="5" fill="#c5e04a" opacity="0.2" />
      <circle cx="60" cy="220" r="2" fill="#3d4f1e" opacity="0.1" />
    </svg>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const planParam = searchParams.get("plan")
  const isCheckoutReturn = searchParams.get("checkout") === "return"
  const preSelectedPlan = !isCheckoutReturn && isPlanId(planParam) ? planParam : null

  const [email, setEmail] = useState("")
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleRedirecting, setIsGoogleRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    async function bootstrap() {
      try {
        const session = await getValidSession()
        if (!session) {
          return
        }

        const profile = await ensureProfile(session)
        if (!profile.plan_selected_at && preSelectedPlan) {
          await startTrial(preSelectedPlan)
          router.replace("/onboarding")
          return
        }

        if (!profile.plan_selected_at) {
          router.replace("/pricing")
          return
        }

        if (isTrialExpired(profile.billing_mode, profile.trial_ends_at)) {
          router.replace("/upgrade")
          return
        }

        router.replace(profile.onboarding_completed ? "/dashboard" : "/onboarding")
      } catch (bootstrapError) {
        setError(bootstrapError instanceof Error ? bootstrapError.message : "Unable to continue.")
      } finally {
        setIsCheckingSession(false)
      }
    }

    void bootstrap()
  }, [preSelectedPlan, router])

  async function handleSendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccessMessage(null)
    setIsSubmitting(true)

    try {
      const normalizedEmail = email.trim().toLowerCase()
      const response = await sendMagicLink(normalizedEmail, preSelectedPlan)
      setSuccessMessage(response.message ?? "Magic link sent. Check your inbox and spam folder.")
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to send magic link")
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleGoogleSignIn() {
    setError(null)
    setSuccessMessage(null)
    setIsGoogleRedirecting(true)
    const query = preSelectedPlan ? `?plan=${encodeURIComponent(preSelectedPlan)}` : ""
    window.location.href = `/api/auth/oauth/google${query}`
  }

  if (isCheckingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="rounded-2xl border border-border/60 bg-card px-6 py-4 text-sm text-muted-foreground">
          Loading...
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen bg-background">
      {/* Left panel — Illustration (hidden on mobile) */}
      <div className="hidden items-center justify-center bg-secondary/40 p-12 lg:flex lg:w-1/2">
        <div className="flex flex-col items-center gap-8">
          <BrandIllustration />
          <div className="text-center">
            <p className="font-serif text-2xl text-foreground">
              They are discussing about you,<br />
              <span className="squiggly-underline">check fast</span>
            </p>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Hacker News · Dev.to · GitHub Discussions — all in one dashboard.
            </p>
          </div>
        </div>
      </div>

      {/* Right panel — Login form */}
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2 lg:px-20">
        <div className="mx-auto w-full max-w-md">
          {/* Logo */}
          <Link href="/" className="inline-flex items-center gap-3" aria-label="Signalze home">
            <Image
              src="/logo.png"
              alt="Signalze"
              width={640}
              height={640}
              className="h-10 w-10 rounded-md object-cover"
              priority
            />
            <span className="font-serif text-2xl font-bold text-foreground">signalze</span>
          </Link>

          <div className="mt-8">
            <p className="font-handwriting text-lg text-primary">
              {preSelectedPlan ? "Continue setup" : "Welcome back"}
            </p>
            <h1 className="mt-1 font-serif text-3xl text-foreground sm:text-4xl">
              {preSelectedPlan ? "Start your free trial" : "Sign in"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {preSelectedPlan
                ? "Continue with Google or a magic link to activate your 2-day trial."
                : "Use Google or a passwordless magic link to continue."}
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleRedirecting || isSubmitting}
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-input bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-70"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {isGoogleRedirecting ? "Redirecting to Google..." : "Continue with Google"}
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border/70" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border/70" />
          </div>

          <form onSubmit={handleSendMagicLink} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
                placeholder="you@company.com"
              />
            </label>

            {error ? (
              <p className="rounded-xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {successMessage ? (
              <p className="rounded-xl bg-primary/10 px-4 py-2.5 text-sm text-primary">
                {successMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 inline-flex h-11 items-center justify-center rounded-full bg-accent px-6 text-sm font-semibold text-accent-foreground transition-all hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Sending magic link..." : "Send magic link"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Need to compare plans first?{" "}
            <Link href="/pricing" className="font-medium text-foreground hover:underline">
              View pricing
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
