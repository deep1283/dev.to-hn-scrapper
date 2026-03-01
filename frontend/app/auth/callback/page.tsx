import { Suspense } from "react"

import { AuthCallbackClient } from "./auth-callback-client"

export const dynamic = "force-dynamic"

function CallbackFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="rounded-2xl border border-border/60 bg-card px-6 py-4 text-sm text-muted-foreground">
        Finishing sign-in...
      </div>
    </main>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<CallbackFallback />}>
      <AuthCallbackClient />
    </Suspense>
  )
}
