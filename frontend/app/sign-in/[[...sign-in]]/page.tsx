"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import { useAuth, useSignIn, useSignUp } from "@clerk/nextjs"

import { BrandIllustration } from "@/components/auth/brand-illustration"
import { isPlanId } from "@/lib/plans"

const AUTH_PROVIDER_TIMEOUT_MS = 20000
const AUTH_PROVIDER_TIMEOUT_ERROR = "auth_provider_timeout"

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const maybeErrors = (error as { errors?: Array<{ longMessage?: string; message?: string }> }).errors
    const first = maybeErrors?.[0]
    if (first?.longMessage) {
      return first.longMessage
    }
    if (first?.message) {
      return first.message
    }
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

function isProviderTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message === AUTH_PROVIDER_TIMEOUT_ERROR
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error(AUTH_PROVIDER_TIMEOUT_ERROR)), timeoutMs)
    }),
  ])
}

function isIdentifierNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false
  }

  const maybeErrors = (error as { errors?: Array<{ code?: string }> }).errors
  const firstCode = maybeErrors?.[0]?.code
  return firstCode === "form_identifier_not_found"
}

export default function SignInPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const authState = useAuth()
  const signInState = useSignIn()
  const signUpState = useSignUp()
  const isAuthLoaded = authState.isLoaded
  const isSignedIn = authState.isSignedIn
  const isLoaded = signInState.isLoaded && signUpState.isLoaded
  const signIn = signInState.isLoaded ? signInState.signIn : null
  const signUp = signUpState.isLoaded ? signUpState.signUp : null
  const setActive = signInState.isLoaded ? signInState.setActive : signUpState.isLoaded ? signUpState.setActive : null

  const [email, setEmail] = useState("")
  const [isGoogleRedirecting, setIsGoogleRedirecting] = useState(false)
  const [isMagicLinkSending, setIsMagicLinkSending] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const magicLinkAttemptRef = useRef(0)

  const next = searchParams.get("next")
  const plan = searchParams.get("plan")

  const redirectAfterAuth = useMemo(() => {
    const params = new URLSearchParams()

    if (next && next.startsWith("/")) {
      params.set("next", next)
    }

    if (plan && isPlanId(plan)) {
      params.set("plan", plan)
    }

    return params.toString() ? `/auth/complete?${params.toString()}` : "/auth/complete"
  }, [next, plan])

  useEffect(() => {
    if (!isAuthLoaded) {
      return
    }

    if (isSignedIn) {
      router.replace(redirectAfterAuth)
    }
  }, [isAuthLoaded, isSignedIn, redirectAfterAuth, router])

  async function postPreflight<T>(url: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const payload = (await response.json().catch(() => null)) as { error?: string } | T | null
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload ? payload.error : null
      throw new Error(typeof message === "string" ? message : "Unable to continue right now.")
    }

    return (payload ?? {}) as T
  }

  async function handleGoogleSignIn() {
    if (!isLoaded || !signIn) {
      return
    }

    if (isSignedIn) {
      router.replace(redirectAfterAuth)
      return
    }

    const signInClient = signIn

    setError(null)
    setSuccessMessage(null)
    setIsGoogleRedirecting(true)

    try {
      await postPreflight("/api/auth/clerk/oauth/google/preflight", {})
      await withTimeout(
        signInClient.authenticateWithRedirect({
          strategy: "oauth_google",
          redirectUrl: "/sign-in/sso-callback",
          redirectUrlComplete: redirectAfterAuth,
        }),
        AUTH_PROVIDER_TIMEOUT_MS,
      )
    } catch (signInError) {
      if (isProviderTimeoutError(signInError)) {
        setError("Google sign-in is taking too long. Please retry.")
      } else {
        setError(getErrorMessage(signInError, "Unable to continue with Google."))
      }
      setIsGoogleRedirecting(false)
    }
  }

  async function handleSendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!isLoaded || !signIn || !signUp || !setActive) {
      return
    }
    const signInClient = signIn
    const signUpClient = signUp
    const setActiveClient = setActive

    const emailInput = email.trim().toLowerCase()
    if (!emailInput) {
      setError("Enter your email.")
      return
    }

    setError(null)
    setSuccessMessage(null)
    setIsMagicLinkSending(true)
    let normalizedEmail = emailInput

    const protocol = window.location.protocol
    const host = window.location.host
    const redirectUrl = `${protocol}//${host}/sign-in/verify?next=${encodeURIComponent(redirectAfterAuth)}`

    async function startSignInMagicLink() {
      const { supportedFirstFactors } = await signInClient.create({ identifier: normalizedEmail })
      const emailLinkFactor = supportedFirstFactors?.find((factor) => factor.strategy === "email_link")
      if (!emailLinkFactor || !("emailAddressId" in emailLinkFactor) || !emailLinkFactor.emailAddressId) {
        throw new Error("Magic link is not enabled for this email sign-in flow.")
      }
      const { startEmailLinkFlow } = signInClient.createEmailLinkFlow()
      const signInAttempt = await startEmailLinkFlow({
        emailAddressId: emailLinkFactor.emailAddressId,
        redirectUrl,
      })
      return signInAttempt
    }

    async function startSignUpMagicLink() {
      await signUpClient.create({ emailAddress: normalizedEmail })
      const { startEmailLinkFlow } = signUpClient.createEmailLinkFlow()
      const signUpAttempt = await startEmailLinkFlow({ redirectUrl })
      return signUpAttempt
    }

    const attemptId = Date.now()
    magicLinkAttemptRef.current = attemptId

    async function runMagicLinkFlow() {
      const signInAttempt = await startSignInMagicLink()
      if (signInAttempt.status === "complete" && signInAttempt.createdSessionId) {
        await setActiveClient({ session: signInAttempt.createdSessionId })
        if (magicLinkAttemptRef.current === attemptId) {
          router.replace(redirectAfterAuth)
        }
        return
      }
      const verification = signInAttempt.firstFactorVerification
      if (verification.verifiedFromTheSameClient()) {
        if (magicLinkAttemptRef.current === attemptId) {
          router.replace(redirectAfterAuth)
        }
        return
      }

      if (magicLinkAttemptRef.current === attemptId) {
        setSuccessMessage("Magic link sent. Check your inbox and spam folder.")
      }
      return
    }

    try {
      const preflight = await postPreflight<{ email?: string }>("/api/auth/clerk/magic-link/preflight", {
        email: emailInput,
      })
      if (typeof preflight.email === "string" && preflight.email.trim()) {
        normalizedEmail = preflight.email.trim().toLowerCase()
      }

      await withTimeout(runMagicLinkFlow(), AUTH_PROVIDER_TIMEOUT_MS)
    } catch (signInError) {
      if (isProviderTimeoutError(signInError)) {
        if (magicLinkAttemptRef.current === attemptId) {
          setError("Magic link request is taking too long. Please try again.")
        }
        return
      }

      const message = getErrorMessage(signInError, "Unable to send magic link.")
      if (!isIdentifierNotFoundError(signInError)) {
        if (magicLinkAttemptRef.current === attemptId) {
          setError(message)
        }
        return
      }

      try {
        const signUpAttempt = await withTimeout(startSignUpMagicLink(), AUTH_PROVIDER_TIMEOUT_MS)
        if (signUpAttempt.status === "complete" && signUpAttempt.createdSessionId) {
          await setActiveClient({ session: signUpAttempt.createdSessionId })
          if (magicLinkAttemptRef.current === attemptId) {
            router.replace(redirectAfterAuth)
          }
          return
        }

        const verification = signUpAttempt.verifications.emailAddress
        if (verification.verifiedFromTheSameClient()) {
          if (magicLinkAttemptRef.current === attemptId) {
            router.replace(redirectAfterAuth)
          }
          return
        }

        if (magicLinkAttemptRef.current === attemptId) {
          setSuccessMessage("Account created. Magic link sent. Check your inbox and spam folder.")
        }
      } catch (signUpError) {
        if (isProviderTimeoutError(signUpError)) {
          if (magicLinkAttemptRef.current === attemptId) {
            setError("Magic link request is taking too long. Please try again.")
          }
          return
        }

        const signUpMessage = getErrorMessage(signUpError, "Unable to send magic link.")
        if (magicLinkAttemptRef.current === attemptId) {
          setError(signUpMessage)
        }
      }
    } finally {
      if (magicLinkAttemptRef.current === attemptId) {
        setIsMagicLinkSending(false)
      }
    }
  }

  return (
    <>
      <main className="flex min-h-screen bg-background">
        <div className="hidden items-center justify-center bg-secondary/40 p-12 lg:flex lg:w-1/2">
          <div className="flex flex-col items-center gap-8">
            <BrandIllustration />
            <div className="text-center">
              <p className="font-serif text-2xl text-foreground">
                They are discussing about you,
                <br />
                <span className="squiggly-underline">check fast</span>
              </p>
              <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                Hacker News · Dev.to · GitHub Discussions — all in one dashboard.
              </p>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col justify-center px-5 py-10 sm:px-12 lg:w-1/2 lg:px-20">
          <div className="mx-auto w-full max-w-md">
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
              <p className="font-handwriting text-lg text-primary">Welcome back</p>
              <h1 className="mt-1 font-serif text-2xl text-foreground sm:text-4xl">Sign in</h1>
              <p className="mt-2 text-sm text-muted-foreground">Use Google or magic link to continue.</p>
            </div>

            <button
              type="button"
              onClick={() => void handleGoogleSignIn()}
              disabled={!isLoaded || isGoogleRedirecting || isMagicLinkSending}
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
                  disabled={!isLoaded || isGoogleRedirecting || isMagicLinkSending}
                  className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
                  placeholder="you@company.com"
                />
              </label>

              {error ? <p className="rounded-xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{error}</p> : null}
              {successMessage ? (
                <p className="rounded-xl bg-primary/10 px-4 py-2.5 text-sm text-primary">{successMessage}</p>
              ) : null}

              <button
                type="submit"
                disabled={!isLoaded || isGoogleRedirecting || isMagicLinkSending}
                className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-full bg-accent px-6 text-sm font-semibold text-accent-foreground transition-all hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isMagicLinkSending ? "Sending magic link..." : "Send magic link"}
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
    </>
  )
}
