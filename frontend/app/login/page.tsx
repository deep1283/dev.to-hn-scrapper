"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { FormEvent, Suspense, useEffect, useState } from "react"

import { BrandIllustration } from "@/components/auth/brand-illustration"
import { isTrialExpired } from "@/lib/client/billing"
import { isPlanId } from "@/lib/plans"
import { ensureProfile, getValidSession } from "@/lib/supabase-lite"

const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

type StartTrialResponse = {
  nextRoute?: string
}

type MagicLinkResponse = {
  ok?: boolean
  message?: string
}

type PasswordAuthResponse = {
  nextRoute?: string
  profile?: {
    plan_selected_at: string | null
  }
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

async function signInWithPasswordFallback(email: string, password: string): Promise<PasswordAuthResponse> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "signin",
      email,
      password,
    }),
  })

  const payload = (await response.json().catch(() => null)) as
    | ({ error?: string } & PasswordAuthResponse)
    | null
  if (!response.ok) {
    throw new Error(payload?.error ?? "Unable to sign in with password.")
  }

  return {
    nextRoute: payload?.nextRoute,
    profile: payload?.profile,
  }
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const planParam = searchParams.get("plan")
  const isCheckoutReturn = searchParams.get("checkout") === "return"
  const clerkDone = searchParams.get("clerk_done") === "1"
  const preSelectedPlan = !isCheckoutReturn && isPlanId(planParam) ? planParam : null
  const safeNext = getSafeNext(searchParams.get("next"))

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false)
  const [isGoogleRedirecting, setIsGoogleRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (hasClerk && !clerkDone) {
      router.replace(`/sign-in${window.location.search}`)
      return
    }

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

        if (!profile.onboarding_completed) {
          router.replace("/onboarding")
          return
        }

        router.replace(safeNext ?? "/dashboard")
      } catch (bootstrapError) {
        setError(bootstrapError instanceof Error ? bootstrapError.message : "Unable to continue.")
      } finally {
        setIsCheckingSession(false)
      }
    }

    void bootstrap()
  }, [clerkDone, preSelectedPlan, router, safeNext])

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

  async function handlePasswordSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccessMessage(null)
    setIsPasswordSubmitting(true)

    try {
      const normalizedEmail = email.trim().toLowerCase()
      if (!normalizedEmail) {
        throw new Error("Enter your email.")
      }
      if (password.length < 8) {
        throw new Error("Enter a valid password.")
      }
      const payload = await signInWithPasswordFallback(normalizedEmail, password)

      if (preSelectedPlan && !payload.profile?.plan_selected_at) {
        const trial = await startTrial(preSelectedPlan)
        router.replace(trial.nextRoute ?? "/onboarding")
        return
      }

      router.replace(payload.nextRoute ?? "/dashboard")
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to sign in with password.")
    } finally {
      setIsPasswordSubmitting(false)
    }
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
      <div className="flex w-full flex-col justify-center px-5 py-10 sm:px-12 lg:w-1/2 lg:px-20">
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
            <span className="font-serif text-xl font-bold text-foreground sm:text-2xl">signalze</span>
          </Link>

          <div className="mt-8">
            <p className="font-handwriting text-lg text-primary">
              {preSelectedPlan ? "Continue setup" : "Welcome back"}
            </p>
            <h1 className="mt-1 font-serif text-2xl text-foreground sm:text-4xl">
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
            disabled={isGoogleRedirecting || isSubmitting || isPasswordSubmitting}
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
                disabled={isSubmitting || isGoogleRedirecting || isPasswordSubmitting}
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
              disabled={isSubmitting || isGoogleRedirecting || isPasswordSubmitting}
              className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-full bg-accent px-6 text-sm font-semibold text-accent-foreground transition-all hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Sending magic link..." : "Send magic link"}
            </button>
          </form>

          <form onSubmit={handlePasswordSignIn} className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Password
              <input
                type="password"
                required
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isPasswordSubmitting || isSubmitting || isGoogleRedirecting}
                className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
                placeholder="Enter your password"
              />
            </label>

            <button
              type="submit"
              disabled={isPasswordSubmitting || isSubmitting || isGoogleRedirecting}
              className="inline-flex h-11 w-full items-center justify-center rounded-full border border-input bg-card px-6 text-sm font-semibold text-foreground transition-all hover:bg-secondary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isPasswordSubmitting ? "Signing in..." : "Sign in with password"}
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
