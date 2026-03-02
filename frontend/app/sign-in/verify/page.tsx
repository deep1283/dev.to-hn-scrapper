"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useMemo, useState } from "react"
import { useClerk } from "@clerk/nextjs"

function getSafeNext(next: string | null): string {
  if (next && next.startsWith("/")) {
    return next
  }
  return "/dashboard"
}

function VerifyMagicLinkContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const clerk = useClerk()

  const [error, setError] = useState<string | null>(null)

  const redirectTarget = useMemo(() => getSafeNext(searchParams.get("next")), [searchParams])

  useEffect(() => {
    let cancelled = false

    async function verify() {
      try {
        await clerk.handleEmailLinkVerification({
          redirectUrl: "/sign-in",
          redirectUrlComplete: redirectTarget,
        })
        if (!cancelled) {
          router.replace(redirectTarget)
        }
      } catch (verificationError) {
        if (cancelled) {
          return
        }

        const maybeErrors = (
          verificationError as { errors?: Array<{ longMessage?: string; message?: string }> }
        )?.errors
        const first = maybeErrors?.[0]
        setError(first?.longMessage ?? first?.message ?? "This sign-in link is invalid or expired.")
      }
    }

    void verify()

    return () => {
      cancelled = true
    }
  }, [clerk, redirectTarget, router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-6 text-center">
        {error ? (
          <>
            <h1 className="font-serif text-2xl text-foreground">Link expired</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Link href="/sign-in" className="mt-6 inline-flex rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="font-serif text-2xl text-foreground">Verifying link</h1>
            <p className="mt-2 text-sm text-muted-foreground">Finishing sign-in...</p>
          </>
        )}
      </div>
    </main>
  )
}

export default function VerifyMagicLinkPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-6 text-center">
            <h1 className="font-serif text-2xl text-foreground">Verifying link</h1>
            <p className="mt-2 text-sm text-muted-foreground">Finishing sign-in...</p>
          </div>
        </main>
      }
    >
      <VerifyMagicLinkContent />
    </Suspense>
  )
}
