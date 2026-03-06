"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import { useAuth, useClerk, useSignIn, useSignUp } from "@clerk/nextjs"

import { BrandIllustration } from "@/components/auth/brand-illustration"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"

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
  const clerk = useClerk()
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
  const [isEmailOtpSending, setIsEmailOtpSending] = useState(false)
  const [isEmailOtpVerifying, setIsEmailOtpVerifying] = useState(false)
  const [isResettingSession, setIsResettingSession] = useState(false)
  const [emailAuthStep, setEmailAuthStep] = useState<"collect-email" | "verify-code">("collect-email")
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [pendingStrategy, setPendingStrategy] = useState<"sign-in" | "sign-up" | null>(null)
  const [verificationCode, setVerificationCode] = useState("")
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const didResetSessionRef = useRef(false)

  const next = searchParams.get("next")
  const shouldForceReauth = searchParams.get("reauth") === "1"

  const redirectAfterAuth = useMemo(() => {
    const params = new URLSearchParams()

    if (next && next.startsWith("/")) {
      params.set("next", next)
    }

    return params.toString() ? `/auth/complete?${params.toString()}` : "/auth/complete"
  }, [next])

  const redirectAfterSessionReset = useMemo(() => {
    const params = new URLSearchParams()

    if (next && next.startsWith("/")) {
      params.set("next", next)
    }

    return params.toString() ? `/sign-in?${params.toString()}` : "/sign-in"
  }, [next])

  useEffect(() => {
    if (!isAuthLoaded) {
      return
    }

    if (!isSignedIn) {
      setIsResettingSession(false)
      return
    }

    if (!shouldForceReauth) {
      router.replace(redirectAfterAuth)
      return
    }

    if (didResetSessionRef.current) {
      return
    }

    didResetSessionRef.current = true
    setIsResettingSession(true)
    void clerk
      .signOut({ redirectUrl: redirectAfterSessionReset })
      .catch(() => undefined)
      .finally(() => {
        setIsResettingSession(false)
      })
  }, [clerk, isAuthLoaded, isSignedIn, redirectAfterAuth, redirectAfterSessionReset, router, shouldForceReauth])

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
      if (!shouldForceReauth) {
        router.replace(redirectAfterAuth)
        return
      }

      setIsResettingSession(true)
      await clerk
        .signOut({ redirectUrl: redirectAfterSessionReset })
        .catch(() => undefined)
        .finally(() => {
          setIsResettingSession(false)
        })
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
        20000,
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

  async function sendExistingUserEmailCode(signInClient: NonNullable<typeof signIn>, normalizedEmail: string) {
    const signInAttempt = await signInClient.create({ identifier: normalizedEmail })
    const emailCodeFactor = signInAttempt.supportedFirstFactors?.find((factor) => factor.strategy === "email_code")

    if (!emailCodeFactor || !("emailAddressId" in emailCodeFactor) || !emailCodeFactor.emailAddressId) {
      throw new Error("Email OTP is not enabled for this sign-in flow.")
    }

    await signInClient.prepareFirstFactor({
      strategy: "email_code",
      emailAddressId: emailCodeFactor.emailAddressId,
    })
  }

  async function sendNewUserEmailCode(signUpClient: NonNullable<typeof signUp>, normalizedEmail: string) {
    await signUpClient.create({ emailAddress: normalizedEmail })
    await signUpClient.prepareEmailAddressVerification({ strategy: "email_code" })
  }

  function resetEmailOtpState() {
    setEmailAuthStep("collect-email")
    setPendingEmail(null)
    setPendingStrategy(null)
    setVerificationCode("")
  }

  async function startEmailOtpFlow() {
    if (!isLoaded || !signIn || !signUp) {
      return
    }
    const signInClient = signIn
    const signUpClient = signUp

    const emailInput = email.trim().toLowerCase()
    if (!emailInput) {
      setError("Enter your email.")
      return
    }

    setError(null)
    setSuccessMessage(null)
    setIsEmailOtpSending(true)
    let normalizedEmail = emailInput

    try {
      const preflight = await postPreflight<{ email?: string }>("/api/auth/clerk/magic-link/preflight", {
        email: emailInput,
      })
      if (typeof preflight.email === "string" && preflight.email.trim()) {
        normalizedEmail = preflight.email.trim().toLowerCase()
      }

      await sendExistingUserEmailCode(signInClient, normalizedEmail)
      setPendingStrategy("sign-in")
      setPendingEmail(normalizedEmail)
      setVerificationCode("")
      setEmailAuthStep("verify-code")
      setSuccessMessage("OTP sent.")
    } catch (signInError) {
      const message = getErrorMessage(signInError, "Unable to send OTP.")
      if (!isIdentifierNotFoundError(signInError)) {
        setError(message)
        return
      }

      try {
        await sendNewUserEmailCode(signUpClient, normalizedEmail)
        setPendingStrategy("sign-up")
        setPendingEmail(normalizedEmail)
        setVerificationCode("")
        setEmailAuthStep("verify-code")
        setSuccessMessage("OTP sent.")
      } catch (signUpError) {
        const signUpMessage = getErrorMessage(signUpError, "Unable to send OTP.")
        setError(signUpMessage)
      }
    } finally {
      setIsEmailOtpSending(false)
    }
  }

  async function handleSendEmailOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await startEmailOtpFlow()
  }

  async function handleResendEmailOtp() {
    if (!isLoaded || !pendingEmail || !pendingStrategy) {
      return
    }

    setError(null)
    setSuccessMessage(null)
    setIsEmailOtpSending(true)

    try {
      await postPreflight<{ email?: string }>("/api/auth/clerk/magic-link/preflight", {
        email: pendingEmail,
      })

      if (pendingStrategy === "sign-in") {
        if (!signIn) {
          throw new Error("Sign-in is still loading.")
        }
        await sendExistingUserEmailCode(signIn, pendingEmail)
      } else {
        if (!signUp) {
          throw new Error("Sign-up is still loading.")
        }
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" })
      }

      setSuccessMessage("OTP sent.")
      setVerificationCode("")
    } catch (resendError) {
      setError(getErrorMessage(resendError, "Unable to resend OTP."))
    } finally {
      setIsEmailOtpSending(false)
    }
  }

  async function handleVerifyEmailOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!isLoaded || !setActive || !pendingStrategy) {
      return
    }

    const setActiveClient = setActive
    const normalizedCode = verificationCode.trim()
    if (normalizedCode.length < 6) {
      setError("Enter the 6-digit OTP.")
      return
    }

    setError(null)
    setSuccessMessage(null)
    setIsEmailOtpVerifying(true)

    try {
      if (pendingStrategy === "sign-in") {
        if (!signIn) {
          throw new Error("Sign-in is still loading.")
        }

        const signInAttempt = await signIn.attemptFirstFactor({
          strategy: "email_code",
          code: normalizedCode,
        })

        if (signInAttempt.status !== "complete" || !signInAttempt.createdSessionId) {
          throw new Error(
            signInAttempt.status === "needs_second_factor"
              ? "2FA is not supported in this flow."
              : `Sign-in incomplete. Clerk status: ${signInAttempt.status}`
          )
        }

        await setActiveClient({ session: signInAttempt.createdSessionId })
      } else {
        if (!signUp) {
          throw new Error("Sign-up is still loading.")
        }

        const signUpAttempt = await signUp.attemptEmailAddressVerification({
          code: normalizedCode,
        })

        if (signUpAttempt.status !== "complete" || !signUpAttempt.createdSessionId) {
          throw new Error(
            signUpAttempt.status === "missing_requirements"
              ? "Sign-up incomplete. Please disable 'Name' or 'Password' requirements in your Clerk Dashboard."
              : `Sign-up incomplete. Clerk status: ${signUpAttempt.status}`
          )
        }

        await setActiveClient({ session: signUpAttempt.createdSessionId })
      }

      router.replace(redirectAfterAuth)
    } catch (verificationError) {
      setError(getErrorMessage(verificationError, "Unable to verify OTP."))
    } finally {
      setIsEmailOtpVerifying(false)
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
              <p className="mt-2 text-sm text-muted-foreground">Use Google or email OTP to continue.</p>
            </div>

            <button
              type="button"
              onClick={() => void handleGoogleSignIn()}
              disabled={!isLoaded || isGoogleRedirecting || isEmailOtpSending || isEmailOtpVerifying || isResettingSession}
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

            <form onSubmit={emailAuthStep === "collect-email" ? handleSendEmailOtp : handleVerifyEmailOtp} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    if (emailAuthStep === "verify-code") {
                      resetEmailOtpState()
                      setSuccessMessage(null)
                    }
                  }}
                  disabled={!isLoaded || isGoogleRedirecting || isEmailOtpSending || isEmailOtpVerifying || isResettingSession || emailAuthStep === "verify-code"}
                  className="h-11 w-full rounded-xl border border-input bg-background px-4 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40 md:text-sm"
                  placeholder="you@company.com"
                />
              </label>

              {emailAuthStep === "verify-code" ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-medium text-foreground">OTP</label>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null)
                        setSuccessMessage(null)
                        setEmail(pendingEmail ?? email)
                        resetEmailOtpState()
                      }}
                      disabled={isEmailOtpSending || isEmailOtpVerifying || isResettingSession}
                      className="text-xs font-medium text-primary transition-colors hover:text-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Use another email
                    </button>
                  </div>

                  <InputOTP
                    maxLength={6}
                    value={verificationCode}
                    onChange={(value) => {
                      setVerificationCode(value)
                      if (error) {
                        setError(null)
                      }
                    }}
                    disabled={!isLoaded || isGoogleRedirecting || isEmailOtpSending || isEmailOtpVerifying || isResettingSession}
                    containerClassName="justify-between"
                  >
                    <InputOTPGroup className="w-full justify-between gap-2">
                      <InputOTPSlot index={0} className="h-12 w-12 rounded-xl border text-base first:rounded-xl first:border last:rounded-xl" />
                      <InputOTPSlot index={1} className="h-12 w-12 rounded-xl border text-base first:rounded-xl first:border last:rounded-xl" />
                      <InputOTPSlot index={2} className="h-12 w-12 rounded-xl border text-base first:rounded-xl first:border last:rounded-xl" />
                      <InputOTPSlot index={3} className="h-12 w-12 rounded-xl border text-base first:rounded-xl first:border last:rounded-xl" />
                      <InputOTPSlot index={4} className="h-12 w-12 rounded-xl border text-base first:rounded-xl first:border last:rounded-xl" />
                      <InputOTPSlot index={5} className="h-12 w-12 rounded-xl border text-base first:rounded-xl first:border last:rounded-xl" />
                    </InputOTPGroup>
                  </InputOTP>

                  <p className="text-xs text-muted-foreground">
                    Enter the 6-digit OTP sent to <span className="font-medium text-foreground">{pendingEmail ?? email}</span>.
                  </p>
                </div>
              ) : null}

              {error ? <p className="rounded-xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{error}</p> : null}
              {successMessage ? (
                <p className="rounded-xl bg-primary/10 px-4 py-2.5 text-sm text-primary">{successMessage}</p>
              ) : null}

              <button
                type="submit"
                disabled={!isLoaded || isGoogleRedirecting || isEmailOtpSending || isEmailOtpVerifying || isResettingSession}
                className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-full bg-accent px-6 text-sm font-semibold text-accent-foreground transition-all hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isResettingSession
                  ? "Preparing sign-in..."
                  : isEmailOtpSending
                    ? "Sending OTP..."
                    : isEmailOtpVerifying
                      ? "Verifying OTP..."
                      : emailAuthStep === "verify-code"
                        ? "Verify OTP"
                        : "Send OTP"}
              </button>

              {emailAuthStep === "verify-code" ? (
                <button
                  type="button"
                  onClick={() => void handleResendEmailOtp()}
                  disabled={!isLoaded || isGoogleRedirecting || isEmailOtpSending || isEmailOtpVerifying || isResettingSession}
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Resend OTP
                </button>
              ) : null}
            </form>


          </div>
        </div>
      </main>
    </>
  )
}
